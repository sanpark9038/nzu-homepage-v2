const fs = require("fs");
const path = require("path");
require("dotenv").config({ path: path.join(__dirname, "..", "..", ".env.local"), quiet: true });

const ROOT = path.resolve(__dirname, "..", "..");
const PROJECTS_DIR = path.join(ROOT, "data", "metadata", "projects");
const DEFAULT_PREFIX = "pipeline-state";
const STATE_KEY = "collection_cadence.v1.json";
const SCHEMA_VERSION = "1.0.0";

// The four operational fields that drive shouldSkipByPriorityWindow. These are
// the only fields hydrate is ever allowed to touch on a roster row.
const CADENCE_FIELDS = ["last_checked_at", "last_match_at", "check_priority", "check_interval_days"];

function hasFlag(argv, flag) {
  return argv.includes(flag);
}

function readJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, "utf8").replace(/^\uFEFF/, ""));
}

function normalizePrefix(value) {
  return String(value || DEFAULT_PREFIX).trim().replace(/^\/+|\/+$/g, "") || DEFAULT_PREFIX;
}

// PIPELINE_STATE_R2_* → PLAYER_HISTORY_R2_* fallback. Returns null when any part
// is missing so callers degrade to a no-op (this state is an optimization, never
// required for collection to run).
// Do NOT fall back to generic R2_*: in this project that credential points at the
// public board-image bucket (star-hosaga-board-images), so persisting state there
// would leak internal JSON into a public site asset bucket. PLAYER_HISTORY_R2_* is
// already a pipeline-artifact bucket and is injected into the nightly workflow.
function getR2Config(env = process.env, prefix = DEFAULT_PREFIX) {
  const accountId = String(env.PIPELINE_STATE_R2_ACCOUNT_ID || env.PLAYER_HISTORY_R2_ACCOUNT_ID || "").trim();
  const accessKeyId = String(env.PIPELINE_STATE_R2_ACCESS_KEY_ID || env.PLAYER_HISTORY_R2_ACCESS_KEY_ID || "").trim();
  const secretAccessKey = String(
    env.PIPELINE_STATE_R2_SECRET_ACCESS_KEY || env.PLAYER_HISTORY_R2_SECRET_ACCESS_KEY || ""
  ).trim();
  const bucketName = String(env.PIPELINE_STATE_R2_BUCKET_NAME || env.PLAYER_HISTORY_R2_BUCKET_NAME || "").trim();
  const prefixValue = normalizePrefix(env.PIPELINE_STATE_R2_PREFIX || prefix);

  if (!accountId || !accessKeyId || !secretAccessKey || !bucketName) return null;
  return { accountId, accessKeyId, secretAccessKey, bucketName, prefix: prefixValue };
}

function makeClient(config) {
  const { S3Client } = require("@aws-sdk/client-s3");
  return new S3Client({
    region: "auto",
    endpoint: `https://${config.accountId}.r2.cloudflarestorage.com`,
    credentials: { accessKeyId: config.accessKeyId, secretAccessKey: config.secretAccessKey },
  });
}

async function downloadState(config, client = makeClient(config)) {
  const { GetObjectCommand } = require("@aws-sdk/client-s3");
  try {
    const res = await client.send(
      new GetObjectCommand({ Bucket: config.bucketName, Key: `${config.prefix}/${STATE_KEY}` })
    );
    const text = await res.Body.transformToString();
    return JSON.parse(text.replace(/^\uFEFF/, ""));
  } catch (error) {
    const name = String((error && (error.name || error.Code)) || "");
    if (name === "NoSuchKey" || name === "NotFound") return { players: {} };
    throw error;
  }
}

async function uploadState(config, doc, client = makeClient(config)) {
  const { PutObjectCommand } = require("@aws-sdk/client-s3");
  await client.send(
    new PutObjectCommand({
      Bucket: config.bucketName,
      Key: `${config.prefix}/${STATE_KEY}`,
      Body: `${JSON.stringify(doc, null, 2)}\n`,
      ContentType: "application/json; charset=utf-8",
      CacheControl: "no-store",
    })
  );
}

function parseTime(value) {
  if (!value) return null;
  const t = new Date(String(value)).getTime();
  return Number.isFinite(t) ? t : null;
}

// State wins only when its last_checked_at is strictly newer than the file's.
// A file with no/invalid timestamp always yields to state; state with no valid
// timestamp never overwrites (protects manual edits).
function stateIsNewer(stateVal, fileVal) {
  const s = parseTime(stateVal);
  if (s === null) return false;
  const f = parseTime(fileVal);
  if (f === null) return true;
  return s > f;
}

// Pure overlay: mutate only CADENCE_FIELDS on rows whose entity_id has a newer
// entry in the state map. Never touches name/team/tier/race/etc. or row count.
// Returns { doc, updated, skipped, reason }. manual_managed docs are skipped.
function overlayRosterCadence(rosterDoc, playersState = {}) {
  if (rosterDoc && rosterDoc.manual_managed) {
    return { doc: rosterDoc, updated: 0, skipped: true, reason: "manual_managed" };
  }
  const roster = Array.isArray(rosterDoc && rosterDoc.roster) ? rosterDoc.roster : [];
  const beforeIds = roster.map((row) => String((row && row.entity_id) || "")).filter(Boolean);
  const beforeCount = roster.length;

  let updated = 0;
  for (const row of roster) {
    const entityId = String((row && row.entity_id) || "").trim();
    if (!entityId) continue;
    const state = playersState[entityId];
    if (!state) continue;
    if (!stateIsNewer(state.last_checked_at, row.last_checked_at)) continue;
    for (const field of CADENCE_FIELDS) {
      if (field in state) row[field] = state[field];
    }
    updated += 1;
  }

  // c25bb7b spirit: if the overlay disturbed row count or lost an entity_id,
  // trust nothing and skip this file rather than write a damaged roster.
  const afterIds = roster.map((row) => String((row && row.entity_id) || "")).filter(Boolean);
  if (roster.length !== beforeCount || afterIds.length !== beforeIds.length) {
    return { doc: rosterDoc, updated: 0, skipped: true, reason: "integrity_violation" };
  }
  return { doc: rosterDoc, updated, skipped: false, reason: null };
}

// Pure extract: roster → { [entity_id]: {4 fields} } for rows carrying an entity_id.
function extractRosterCadence(rosterDoc) {
  const out = {};
  const roster = Array.isArray(rosterDoc && rosterDoc.roster) ? rosterDoc.roster : [];
  for (const row of roster) {
    const entityId = String((row && row.entity_id) || "").trim();
    if (!entityId) continue;
    const entry = {};
    for (const field of CADENCE_FIELDS) entry[field] = row && field in row ? row[field] : null;
    out[entityId] = entry;
  }
  return out;
}

// Managed team roster files (manual_managed teams like ganada excluded).
function loadManagedRosterFiles(projectsDir = PROJECTS_DIR) {
  if (!fs.existsSync(projectsDir)) return [];
  return fs
    .readdirSync(projectsDir, { withFileTypes: true })
    .filter((d) => d.isDirectory())
    .map((d) => path.join(projectsDir, d.name, `players.${d.name}.v1.json`))
    .filter((filePath) => fs.existsSync(filePath))
    .filter((filePath) => {
      try {
        return !readJson(filePath).manual_managed;
      } catch {
        return false;
      }
    })
    .sort();
}

async function hydrate({ env = process.env, projectsDir = PROJECTS_DIR, prefix = DEFAULT_PREFIX, log = console.log } = {}) {
  const config = getR2Config(env, prefix);
  if (!config) {
    log("[cadence] hydrate skipped: R2 not configured (PIPELINE_STATE_R2_*/PLAYER_HISTORY_R2_* unset)");
    return { skipped: true, reason: "missing_r2_env" };
  }
  const stateDoc = await downloadState(config);
  const players = (stateDoc && stateDoc.players) || {};
  const files = loadManagedRosterFiles(projectsDir);
  const results = [];
  let totalUpdated = 0;
  for (const filePath of files) {
    const doc = readJson(filePath);
    const { updated, skipped, reason } = overlayRosterCadence(doc, players);
    if (skipped) {
      if (reason === "integrity_violation") log(`[cadence] WARN skipped ${path.basename(filePath)}: ${reason}`);
      results.push({ file: path.relative(ROOT, filePath).replace(/\\/g, "/"), updated: 0, skipped, reason });
      continue;
    }
    if (updated > 0) fs.writeFileSync(filePath, JSON.stringify(doc, null, 2), "utf8");
    totalUpdated += updated;
    results.push({ file: path.relative(ROOT, filePath).replace(/\\/g, "/"), updated, skipped: false, reason: null });
  }
  log(`[cadence] hydrate: ${totalUpdated} player(s) refreshed across ${files.length} team file(s)`);
  return { skipped: false, state_players: Object.keys(players).length, total_updated: totalUpdated, files: results };
}

async function persist({ env = process.env, projectsDir = PROJECTS_DIR, prefix = DEFAULT_PREFIX, log = console.log } = {}) {
  const config = getR2Config(env, prefix);
  if (!config) {
    log("[cadence] persist skipped: R2 not configured (PIPELINE_STATE_R2_*/PLAYER_HISTORY_R2_* unset)");
    return { skipped: true, reason: "missing_r2_env" };
  }
  const players = {};
  for (const filePath of loadManagedRosterFiles(projectsDir)) {
    Object.assign(players, extractRosterCadence(readJson(filePath)));
  }
  const doc = { schema_version: SCHEMA_VERSION, updated_at: new Date().toISOString(), players };
  await uploadState(config, doc);
  log(`[cadence] persist: uploaded ${Object.keys(players).length} player(s) to ${config.prefix}/${STATE_KEY}`);
  return { skipped: false, players: Object.keys(players).length, key: `${config.prefix}/${STATE_KEY}` };
}

async function main(argv = process.argv.slice(2)) {
  if (hasFlag(argv, "--hydrate")) {
    await hydrate();
    return;
  }
  if (hasFlag(argv, "--persist")) {
    await persist();
    return;
  }
  console.error("usage: sync-collection-cadence.js --hydrate | --persist");
  process.exit(2);
}

if (require.main === module) {
  main().catch((error) => {
    console.error(error instanceof Error ? error.stack || error.message : String(error));
    process.exit(1);
  });
}

module.exports = {
  CADENCE_FIELDS,
  DEFAULT_PREFIX,
  STATE_KEY,
  getR2Config,
  stateIsNewer,
  overlayRosterCadence,
  extractRosterCadence,
  loadManagedRosterFiles,
  hydrate,
  persist,
};
