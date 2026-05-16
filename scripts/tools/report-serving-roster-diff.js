const fs = require("fs");
const path = require("path");

const { loadProjectPlayerMetadata, readJson, trim } = require("./lib/project-player-metadata");

const ROOT = path.join(__dirname, "..", "..");
const REPORTS_DIR = path.join(ROOT, "tmp", "reports");
const EXCLUSIONS_PATH = path.join(ROOT, "data", "metadata", "pipeline_collection_exclusions.v1.json");
const JSON_REPORT_PATH = path.join(REPORTS_DIR, "serving_roster_diff_latest.json");
const MD_REPORT_PATH = path.join(REPORTS_DIR, "serving_roster_diff_latest.md");

const SERVING_FIELDS = [
  "id",
  "name",
  "nickname",
  "eloboard_id",
  "gender",
  "tier",
  "race",
  "university",
  "soop_id",
  "photo_url",
  "last_match_at",
  "last_changed_at",
  "check_priority",
  "check_interval_days",
].join(",");

function parseArgs(argv = process.argv.slice(2)) {
  const options = {
    servingJson: "",
    fromSupabase: false,
  };

  for (const arg of argv) {
    if (arg === "--from-supabase") {
      options.fromSupabase = true;
      continue;
    }
    if (arg.startsWith("--serving-json=")) {
      options.servingJson = arg.slice("--serving-json=".length);
      continue;
    }
  }

  return options;
}

function extractWrId(value) {
  const raw = trim(value);
  if (!raw) return "";
  if (/^\d+$/.test(raw)) return raw;
  const match = raw.match(/(\d+)$/);
  return match ? match[1] : "";
}

function inferGenderFromEntityId(value) {
  const match = trim(value).match(/^eloboard:(male|female)(?::mix)?:\d+$/i);
  return match ? String(match[1] || "").toLowerCase() : "";
}

function identityKey(row) {
  const entityId = trim(row && (row.entity_id || row.eloboard_id));
  const wrId = extractWrId((row && row.wr_id) || entityId);
  const gender = trim(row && row.gender).toLowerCase() || inferGenderFromEntityId(entityId);
  if (wrId && gender) return `${gender}:${wrId}`;
  if (entityId) return `entity:${entityId.toLowerCase()}`;
  return "";
}

function normalizeRace(value) {
  const raw = trim(value).toUpperCase();
  if (raw.startsWith("T")) return "T";
  if (raw.startsWith("Z")) return "Z";
  if (raw.startsWith("P")) return "P";
  return raw;
}

function normalizeRosterRow(row, source) {
  const key = identityKey(row);
  const sourceName = trim(row && row.name);
  const displayName = trim(row && row.display_name) || sourceName;
  const entityId = trim(row && (row.entity_id || row.eloboard_id));
  return {
    key,
    source,
    entity_id: entityId || null,
    wr_id: extractWrId((row && row.wr_id) || entityId) || null,
    gender: trim(row && row.gender).toLowerCase() || inferGenderFromEntityId(entityId) || null,
    name: sourceName || displayName,
    display_name: displayName || sourceName,
    source_name: sourceName || displayName,
    team_code: trim(row && row.team_code) || null,
    university: trim(row && (row.team_name || row.university)) || null,
    tier: trim(row && row.tier) || null,
    race: normalizeRace(row && row.race) || null,
    soop_id: trim(row && (row.soop_user_id || row.soop_id)) || null,
    photo_url: trim(row && (row.photo_url || row.profile_url)) || null,
    last_match_at: trim(row && row.last_match_at) || null,
    last_changed_at: trim(row && row.last_changed_at) || null,
    check_priority: trim(row && row.check_priority) || null,
    check_interval_days:
      row && Number.isFinite(Number(row.check_interval_days)) ? Number(row.check_interval_days) : null,
  };
}

function loadExclusionRules() {
  if (!fs.existsSync(EXCLUSIONS_PATH)) return [];
  const doc = readJson(EXCLUSIONS_PATH);
  return (Array.isArray(doc && doc.players) ? doc.players : []).map((row) => ({
    entity_id: trim(row && row.entity_id) || null,
    wr_id: extractWrId(row && row.wr_id) || null,
    name: trim(row && row.name).toLowerCase() || null,
  }));
}

function shouldExclude(row, rules) {
  const entityId = trim(row && (row.entity_id || row.eloboard_id));
  const wrId = extractWrId((row && row.wr_id) || entityId);
  const name = trim(row && row.name).toLowerCase();
  return rules.some((rule) => {
    if (rule.entity_id) return entityId === rule.entity_id;
    if (rule.wr_id && rule.name) return wrId === rule.wr_id && name === rule.name;
    if (rule.wr_id) return wrId === rule.wr_id;
    if (rule.name) return name === rule.name;
    return false;
  });
}

function canonicalRowsFromProjectMetadata() {
  const exclusionRules = loadExclusionRules();
  const rows = loadProjectPlayerMetadata({ includeUnidentified: true });
  return rows
    .filter((row) => !shouldExclude(row, exclusionRules))
    .map((row) => normalizeRosterRow(row, "canonical_project_metadata"))
    .filter((row) => row.key);
}

function readServingJson(filePath) {
  const absolute = path.isAbsolute(filePath) ? filePath : path.join(ROOT, filePath);
  const doc = readJson(absolute);
  if (Array.isArray(doc)) return doc;
  if (Array.isArray(doc && doc.players)) return doc.players;
  if (Array.isArray(doc && doc.data)) return doc.data;
  throw new Error(`serving json must be an array or contain players/data array: ${filePath}`);
}

async function readServingRowsFromSupabase() {
  require("dotenv").config({ path: path.join(ROOT, ".env.local") });
  const { createClient } = require("@supabase/supabase-js");
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || "";
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_KEY || "";
  if (!supabaseUrl || !serviceRoleKey) {
    throw new Error("Supabase read requires NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY.");
  }

  const supabase = createClient(supabaseUrl, serviceRoleKey);
  const { data, error } = await supabase.from("players").select(SERVING_FIELDS);
  if (error) throw error;
  return data || [];
}

function buildIdentityMap(rows) {
  const map = new Map();
  const duplicate_keys = [];
  for (const row of rows) {
    if (!row.key) continue;
    if (map.has(row.key)) {
      duplicate_keys.push(row.key);
      continue;
    }
    map.set(row.key, row);
  }
  return { map, duplicate_keys: Array.from(new Set(duplicate_keys)).sort() };
}

function changedFields(canonical, serving) {
  const fields = ["name", "university", "tier", "race", "soop_id"];
  return fields.filter((field) => {
    if (field === "name") {
      const servingName = trim(serving.name);
      return servingName !== trim(canonical.name) && servingName !== trim(canonical.display_name);
    }
    return trim(canonical[field]) !== trim(serving[field]);
  });
}

function compactPair(canonical, serving, fields = []) {
  const base = {
    key: (canonical || serving).key,
    entity_id: (canonical || serving).entity_id,
    canonical_name: canonical ? canonical.name : null,
    canonical_display_name: canonical ? canonical.display_name : null,
    serving_name: serving ? serving.name : null,
    serving_display_name: serving ? serving.display_name : null,
    canonical_university: canonical ? canonical.university : null,
    serving_university: serving ? serving.university : null,
    canonical_tier: canonical ? canonical.tier : null,
    serving_tier: serving ? serving.tier : null,
    canonical_race: canonical ? canonical.race : null,
    serving_race: serving ? serving.race : null,
    canonical_soop_id: canonical ? canonical.soop_id : null,
    serving_soop_id: serving ? serving.soop_id : null,
  };
  if (fields.length > 0) base.changed_fields = fields;
  return base;
}

function buildServingRosterDiff(canonicalRows, servingRows = []) {
  const canonical = canonicalRows.map((row) => normalizeRosterRow(row, "canonical"));
  const serving = servingRows.map((row) => normalizeRosterRow(row, "serving"));
  const canonicalMap = buildIdentityMap(canonical);
  const servingMap = buildIdentityMap(serving);

  const added = [];
  const removed = [];
  const changed = [];
  const unchanged = [];

  for (const [key, canonicalRow] of canonicalMap.map.entries()) {
    const servingRow = servingMap.map.get(key);
    if (!servingRow) {
      added.push(compactPair(canonicalRow, null));
      continue;
    }
    const fields = changedFields(canonicalRow, servingRow);
    if (fields.length > 0) {
      changed.push(compactPair(canonicalRow, servingRow, fields));
    } else {
      unchanged.push(compactPair(canonicalRow, servingRow));
    }
  }

  for (const [key, servingRow] of servingMap.map.entries()) {
    if (!canonicalMap.map.has(key)) removed.push(compactPair(null, servingRow));
  }

  const byField = {
    name: changed.filter((row) => row.changed_fields.includes("name")),
    university: changed.filter((row) => row.changed_fields.includes("university")),
    tier: changed.filter((row) => row.changed_fields.includes("tier")),
    race: changed.filter((row) => row.changed_fields.includes("race")),
    soop_id: changed.filter((row) => row.changed_fields.includes("soop_id")),
  };

  return {
    counts: {
      canonical_rows: canonical.length,
      serving_rows: serving.length,
      added: added.length,
      removed: removed.length,
      changed: changed.length,
      unchanged: unchanged.length,
      duplicate_canonical_keys: canonicalMap.duplicate_keys.length,
      duplicate_serving_keys: servingMap.duplicate_keys.length,
    },
    duplicate_keys: {
      canonical: canonicalMap.duplicate_keys,
      serving: servingMap.duplicate_keys,
    },
    added,
    removed,
    changed,
    changed_by_field: byField,
    unchanged_preview: unchanged.slice(0, 20),
  };
}

function previewRows(rows, limit = 20) {
  return rows.slice(0, limit);
}

function markdownTable(rows, columns) {
  if (rows.length === 0) return "_None_\n";
  const header = `| ${columns.map((column) => column.label).join(" | ")} |`;
  const divider = `| ${columns.map(() => "---").join(" | ")} |`;
  const body = rows.map((row) => `| ${columns.map((column) => trim(row[column.key]).replace(/\|/g, "/")).join(" | ")} |`);
  return [header, divider, ...body].join("\n") + "\n";
}

function buildMarkdown(report) {
  const lines = [];
  lines.push("# Serving Roster Diff");
  lines.push("");
  lines.push(`- generated_at: ${report.generated_at}`);
  lines.push(`- comparison_source: ${report.comparison_source}`);
  lines.push(`- canonical_rows: ${report.counts.canonical_rows}`);
  lines.push(`- serving_rows: ${report.counts.serving_rows}`);
  lines.push(`- added: ${report.counts.added}`);
  lines.push(`- removed: ${report.counts.removed}`);
  lines.push(`- changed: ${report.counts.changed}`);
  lines.push(`- unchanged: ${report.counts.unchanged}`);
  lines.push("");
  lines.push("## Changed By Field");
  lines.push("");
  for (const field of ["name", "university", "tier", "race", "soop_id"]) {
    lines.push(`- ${field}: ${report.changed_by_field[field].length}`);
  }
  lines.push("");
  lines.push("## Added Preview");
  lines.push("");
  lines.push(markdownTable(previewRows(report.added), [
    { key: "key", label: "key" },
    { key: "canonical_name", label: "name" },
    { key: "canonical_university", label: "team" },
    { key: "canonical_tier", label: "tier" },
    { key: "canonical_soop_id", label: "soop" },
  ]));
  lines.push("");
  lines.push("## Removed Preview");
  lines.push("");
  lines.push(markdownTable(previewRows(report.removed), [
    { key: "key", label: "key" },
    { key: "serving_name", label: "name" },
    { key: "serving_university", label: "team" },
    { key: "serving_tier", label: "tier" },
    { key: "serving_soop_id", label: "soop" },
  ]));
  lines.push("");
  lines.push("## Changed Preview");
  lines.push("");
  lines.push(markdownTable(previewRows(report.changed), [
    { key: "key", label: "key" },
    { key: "canonical_name", label: "canonical" },
    { key: "serving_name", label: "serving" },
    { key: "canonical_university", label: "canonical team" },
    { key: "serving_university", label: "serving team" },
    { key: "changed_fields", label: "fields" },
  ]));
  return lines.join("\n");
}

function writeReports(report) {
  fs.mkdirSync(REPORTS_DIR, { recursive: true });
  fs.writeFileSync(JSON_REPORT_PATH, JSON.stringify(report, null, 2), "utf8");
  fs.writeFileSync(MD_REPORT_PATH, buildMarkdown(report), "utf8");
}

async function buildReport(options = {}) {
  const canonicalRows = canonicalRowsFromProjectMetadata();
  let servingRows = [];
  let comparisonSource = "none";

  if (options.servingJson) {
    servingRows = readServingJson(options.servingJson);
    comparisonSource = `serving-json:${options.servingJson}`;
  } else if (options.fromSupabase) {
    servingRows = await readServingRowsFromSupabase();
    comparisonSource = "supabase:players";
  }

  const diff = buildServingRosterDiff(canonicalRows, servingRows);
  return {
    generated_at: new Date().toISOString(),
    recommended_source_of_truth: "data/metadata/projects/*/players.*.v1.json",
    comparison_source: comparisonSource,
    report_paths: {
      json: path.relative(ROOT, JSON_REPORT_PATH).replace(/\\/g, "/"),
      markdown: path.relative(ROOT, MD_REPORT_PATH).replace(/\\/g, "/"),
    },
    ...diff,
  };
}

async function main() {
  const options = parseArgs();
  const report = await buildReport(options);
  writeReports(report);
  console.log("Wrote serving roster diff report.");
  console.log(`- json: ${report.report_paths.json}`);
  console.log(`- markdown: ${report.report_paths.markdown}`);
  console.log(`- comparison_source: ${report.comparison_source}`);
  console.log(`- canonical_rows: ${report.counts.canonical_rows}`);
  console.log(`- serving_rows: ${report.counts.serving_rows}`);
  console.log(`- added: ${report.counts.added}`);
  console.log(`- removed: ${report.counts.removed}`);
  console.log(`- changed: ${report.counts.changed}`);
}

if (require.main === module) {
  main().catch((error) => {
    console.error(error);
    process.exitCode = 1;
  });
}

module.exports = {
  buildReport,
  buildServingRosterDiff,
  changedFields,
  identityKey,
  normalizeRosterRow,
  parseArgs,
};
