const fs = require("fs");
const path = require("path");
const { createClient } = require("@supabase/supabase-js");
require("dotenv").config({ path: path.join(__dirname, "..", "..", ".env.local"), quiet: true });

const ROOT = path.resolve(__dirname, "..", "..");
const PLAYER_METADATA_PATH = path.join(ROOT, "scripts", "player_metadata.json");
const SOOP_MAPPINGS_PATH = path.join(ROOT, "data", "metadata", "soop_channel_mappings.v1.json");
const SOOP_REVIEW_DECISIONS_PATH = path.join(ROOT, "data", "metadata", "soop_manual_review_decisions.v1.json");
const SNAPSHOT_PATH = path.join(ROOT, "data", "metadata", "soop_live_snapshot.generated.v1.json");
const SNAPSHOT_FRESH_MS = 15 * 60 * 1000;
const UPDATE_CHUNK_SIZE = 100;

const supabaseUrl = String(process.env.NEXT_PUBLIC_SUPABASE_URL || "").trim();
const supabaseServiceRoleKey = String(
  process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_KEY || ""
).trim();

if (!supabaseUrl || !supabaseServiceRoleKey) {
  throw new Error(
    "SOOP live sync requires NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY (or SUPABASE_SERVICE_KEY)."
  );
}

const supabase = createClient(supabaseUrl, supabaseServiceRoleKey);

function readJsonIfExists(filePath, fallback = null) {
  if (!fs.existsSync(filePath)) return fallback;
  return JSON.parse(fs.readFileSync(filePath, "utf8").replace(/^\uFEFF/, ""));
}

function trim(value) {
  return String(value || "").trim();
}

function normalizeLookupName(value) {
  return trim(value).toLowerCase();
}

function extractWrId(value) {
  const raw = trim(value);
  if (!raw) return null;
  if (/^\d+$/.test(raw)) return raw;
  const match = raw.match(/(\d+)$/);
  return match ? match[1] : null;
}

function isMixEntityId(value) {
  return /^eloboard:(male|female):mix:\d+$/i.test(trim(value));
}

function normalizeSoopAssetUrl(value) {
  const raw = trim(value);
  if (!raw) return null;
  if (raw.startsWith("//")) return `https:${raw}`;
  return raw;
}

function buildSoopLookup() {
  const lookup = new Map();
  const byWrId = new Map();
  const byNameGenderBuckets = new Map();
  const byNameBuckets = new Map();

  const registerNamePayload = (nameValue, payload) => {
    const normalized = normalizeLookupName(nameValue);
    if (!normalized || !payload || !payload.soop_id) return;
    const bucket = byNameBuckets.get(normalized) || [];
    bucket.push(payload);
    byNameBuckets.set(normalized, bucket);
  };

  const metadataRows = readJsonIfExists(PLAYER_METADATA_PATH, []);
  for (const row of Array.isArray(metadataRows) ? metadataRows : []) {
    const wrId = Number(row && row.wr_id);
    const gender = trim(row && row.gender).toLowerCase();
    const soopUserId = trim(row && row.soop_user_id);
    const name = normalizeLookupName(row && row.name);
    if (!Number.isFinite(wrId) || !gender || !soopUserId) continue;
    const payload = { soop_id: soopUserId };
    lookup.set(`${wrId}:${gender}`, payload);
    byWrId.set(String(wrId), payload);
    if (name) {
      const key = `${name}:${gender}`;
      const bucket = byNameGenderBuckets.get(key) || [];
      bucket.push(payload);
      byNameGenderBuckets.set(key, bucket);
    }
    registerNamePayload(name, payload);
  }

  const mappingsDoc = readJsonIfExists(SOOP_MAPPINGS_PATH, {});
  const aliases = mappingsDoc && typeof mappingsDoc.aliases === "object" ? mappingsDoc.aliases : {};
  const mappings = Array.isArray(mappingsDoc && mappingsDoc.mappings) ? mappingsDoc.mappings : [];
  for (const row of mappings) {
    const soopUserId = trim(row && row.soop_user_id);
    const rawName = trim(row && row.name);
    if (!rawName || !soopUserId) continue;
    const payload = { soop_id: soopUserId };
    registerNamePayload(rawName, payload);
    registerNamePayload(aliases[rawName] || "", payload);
  }

  const reviewDoc = readJsonIfExists(SOOP_REVIEW_DECISIONS_PATH, {});
  const decisions = Array.isArray(reviewDoc && reviewDoc.decisions) ? reviewDoc.decisions : [];
  for (const row of decisions) {
    const decision = trim(row && row.decision).toLowerCase();
    const soopUserId = trim(row && row.soop_user_id);
    if (decision !== "include" || !soopUserId) continue;
    const payload = { soop_id: soopUserId };
    registerNamePayload(row && row.source_name, payload);
    registerNamePayload(row && row.canonical_name, payload);
    for (const alias of Array.isArray(row && row.alias_names) ? row.alias_names : []) {
      registerNamePayload(alias, payload);
    }
  }

  const byNameGender = new Map();
  for (const [key, bucket] of byNameGenderBuckets.entries()) {
    const uniquePayloads = bucket.filter(
      (payload, index, arr) => arr.findIndex((candidate) => candidate.soop_id === payload.soop_id) === index
    );
    if (uniquePayloads.length === 1) {
      byNameGender.set(key, uniquePayloads[0]);
    }
  }

  const byName = new Map();
  for (const [key, bucket] of byNameBuckets.entries()) {
    const uniquePayloads = bucket.filter(
      (payload, index, arr) => arr.findIndex((candidate) => candidate.soop_id === payload.soop_id) === index
    );
    if (uniquePayloads.length === 1) {
      byName.set(key, uniquePayloads[0]);
    }
  }

  return { lookup, byWrId, byNameGender, byName };
}

function loadFreshSnapshot() {
  const doc = readJsonIfExists(SNAPSHOT_PATH, null);
  if (!doc || typeof doc !== "object") {
    throw new Error(`Missing snapshot file: ${SNAPSHOT_PATH}`);
  }
  const updatedAt = trim(doc.updated_at);
  const updatedTime = Date.parse(updatedAt);
  const isFresh =
    Number.isFinite(updatedTime) &&
    Date.now() - updatedTime >= 0 &&
    Date.now() - updatedTime <= SNAPSHOT_FRESH_MS;
  if (!isFresh) {
    throw new Error(`SOOP snapshot is stale or invalid: ${updatedAt || "missing updated_at"}`);
  }
  return {
    updated_at: updatedAt,
    channels: doc && typeof doc.channels === "object" ? doc.channels : {},
  };
}

function resolveSoopIdForPlayer(row, soopLookup) {
  const direct = trim(row && row.soop_id);
  if (direct) return direct;

  const entityId = trim(row && row.eloboard_id);
  const wrId = extractWrId(entityId);
  const gender = trim(row && row.gender).toLowerCase();
  const name = normalizeLookupName(row && (row.nickname || row.name));

  const metadata =
    (wrId && gender ? soopLookup.lookup.get(`${wrId}:${gender}`) : null) ||
    (wrId && isMixEntityId(entityId) ? soopLookup.byWrId.get(String(wrId)) : null) ||
    (name && gender ? soopLookup.byNameGender.get(`${name}:${gender}`) : null) ||
    (name ? soopLookup.byName.get(name) : null) ||
    null;

  return metadata && metadata.soop_id ? metadata.soop_id : "";
}

function buildUpdatePayloads(players, snapshot, soopLookup) {
  const checkedAt = new Date().toISOString();
  const updates = [];
  let liveCount = 0;
  let offlineCount = 0;
  let unresolvedCount = 0;

  for (const player of Array.isArray(players) ? players : []) {
    const soopId = resolveSoopIdForPlayer(player, soopLookup);
    const channel = soopId ? snapshot.channels[soopId] : null;
    const isLive = Boolean(channel && channel.isLive === true);
    if (isLive) liveCount += 1;
    else offlineCount += 1;
    if (!soopId) unresolvedCount += 1;

    updates.push({
      id: player.id,
      soop_id: soopId || player.soop_id || null,
      is_live: isLive,
      broadcast_title: isLive ? trim(channel.title) || null : null,
      live_thumbnail_url: isLive ? normalizeSoopAssetUrl(channel.thumbnail) : null,
      last_checked_at: checkedAt,
    });
  }

  return {
    checkedAt,
    updates,
    liveCount,
    offlineCount,
    unresolvedCount,
  };
}

async function fetchServingPlayers() {
  const { data, error } = await supabase
    .from("players")
    .select("id,name,nickname,soop_id,eloboard_id,gender,is_live,broadcast_title,live_thumbnail_url,last_checked_at");
  if (error) throw error;
  return Array.isArray(data) ? data : [];
}

async function applyUpdates(rows) {
  for (let index = 0; index < rows.length; index += UPDATE_CHUNK_SIZE) {
    const chunk = rows.slice(index, index + UPDATE_CHUNK_SIZE);
    await Promise.all(
      chunk.map(async ({ id, ...patch }) => {
        const { error } = await supabase.from("players").update(patch).eq("id", id);
        if (error) throw error;
      })
    );
  }
}

async function main() {
  const soopLookup = buildSoopLookup();
  const snapshot = loadFreshSnapshot();
  const players = await fetchServingPlayers();
  const { updates, checkedAt, liveCount, offlineCount, unresolvedCount } = buildUpdatePayloads(
    players,
    snapshot,
    soopLookup
  );

  await applyUpdates(updates);

  console.log("SOOP live state synced to Supabase.");
  console.log(`- players_total: ${players.length}`);
  console.log(`- live_count: ${liveCount}`);
  console.log(`- offline_count: ${offlineCount}`);
  console.log(`- unresolved_soop_id_count: ${unresolvedCount}`);
  console.log(`- snapshot_updated_at: ${snapshot.updated_at}`);
  console.log(`- checked_at: ${checkedAt}`);
}

main().catch((error) => {
  if (error instanceof Error) {
    console.error(error.stack || error.message);
  } else if (error && typeof error === "object") {
    try {
      console.error(JSON.stringify(error, null, 2));
    } catch {
      console.error(String(error));
    }
  } else {
    console.error(String(error));
  }
  process.exit(1);
});
