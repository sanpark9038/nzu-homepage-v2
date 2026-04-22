const fs = require("fs");
const path = require("path");
const { shouldApplyManualTierOverride } = require("./lib/roster-admin-store");

const ROOT = path.resolve(__dirname, "..", "..");
const FA_PATH = path.join(ROOT, "data", "metadata", "projects", "fa", "players.fa.v1.json");
const OVERRIDES_PATH = path.join(ROOT, "data", "metadata", "roster_manual_overrides.v1.json");
const EXCLUSIONS_PATH = path.join(ROOT, "data", "metadata", "pipeline_collection_exclusions.v1.json");
const REPORTS_DIR = path.join(ROOT, "tmp", "reports");

function readJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, "utf8").replace(/^\uFEFF/, ""));
}

function argValue(flag, fallback = "") {
  const idx = process.argv.indexOf(flag);
  if (idx >= 0 && process.argv[idx + 1]) return String(process.argv[idx + 1]);
  return fallback;
}

function hasFlag(flag) {
  return process.argv.includes(flag);
}

function normalizeName(value) {
  return String(value || "").trim();
}

function toDateMs(value) {
  const ms = new Date(String(value || "")).getTime();
  return Number.isFinite(ms) ? ms : 0;
}

function readOverrides() {
  if (!fs.existsSync(OVERRIDES_PATH)) return [];
  try {
    const doc = readJson(OVERRIDES_PATH);
    return Array.isArray(doc.overrides) ? doc.overrides : [];
  } catch {
    return [];
  }
}

function readExclusions() {
  if (!fs.existsSync(EXCLUSIONS_PATH)) return [];
  try {
    const doc = readJson(EXCLUSIONS_PATH);
    return Array.isArray(doc.players) ? doc.players : [];
  } catch {
    return [];
  }
}

function buildOverrideLookups(rows) {
  const byEntity = new Map();
  const byName = new Map();
  for (const row of rows) {
    const entityId = String(row && row.entity_id ? row.entity_id : "").trim();
    const name = normalizeName(row && row.name ? row.name : "");
    if (entityId) byEntity.set(entityId, row);
    if (name && !byName.has(name)) byName.set(name, row);
  }
  return { byEntity, byName };
}

function formatDate(value) {
  const s = String(value || "").trim();
  if (!s) return "-";
  return s.slice(0, 10);
}

function buildExclusionMatchers(rows) {
  const entityIds = new Set();
  const wrIds = new Set();
  const names = new Set();
  for (const row of rows) {
    const entityId = String(row && row.entity_id ? row.entity_id : "").trim();
    const name = normalizeName(row && row.name ? row.name : "");
    const wrId = Number(row && row.wr_id);
    if (entityId) entityIds.add(entityId);
    if (Number.isFinite(wrId) && wrId > 0) wrIds.add(wrId);
    if (name) names.add(name);
  }
  return { entityIds, wrIds, names };
}

function main() {
  const limit = Number(argValue("--limit", "40")) || 40;
  const includeResolved = hasFlag("--include-resolved");

  if (!fs.existsSync(FA_PATH)) {
    throw new Error(`Missing FA metadata: ${FA_PATH}`);
  }

  const faDoc = readJson(FA_PATH);
  const roster = Array.isArray(faDoc.roster) ? faDoc.roster : [];
  const overrides = readOverrides();
  const exclusions = readExclusions();
  const lookup = buildOverrideLookups(overrides);
  const exclusionMatchers = buildExclusionMatchers(exclusions);

  const rows = roster.map((player) => {
    const entityId = String(player && player.entity_id ? player.entity_id : "").trim();
    const name = normalizeName(player && player.name ? player.name : "");
    const displayName = normalizeName(player && player.display_name ? player.display_name : "");
    const override = lookup.byEntity.get(entityId) || lookup.byName.get(name) || null;
    const overrideTier =
      shouldApplyManualTierOverride(override) && override && override.tier ? String(override.tier).trim() : "";
    const effectiveTier = overrideTier || String(player && player.tier ? player.tier : "").trim() || "미정";
    return {
      entity_id: entityId,
      name,
      display_name: displayName && displayName !== name ? displayName : "",
      race: String(player && player.race ? player.race : "").trim() || "Unknown",
      tier: effectiveTier,
      source_tier: String(player && player.tier ? player.tier : "").trim() || "미정",
      override_tier: overrideTier || null,
      check_priority: String(player && player.check_priority ? player.check_priority : "").trim() || "normal",
      last_match_at: player && player.last_match_at ? String(player.last_match_at) : null,
      last_checked_at: player && player.last_checked_at ? String(player.last_checked_at) : null,
      needs_review: effectiveTier === "미정",
      is_excluded:
        exclusionMatchers.entityIds.has(entityId) ||
        exclusionMatchers.names.has(name) ||
        exclusionMatchers.wrIds.has(Number(player && player.wr_id)),
    };
  });

  const filtered = rows
    .filter((row) => !row.is_excluded)
    .filter((row) => includeResolved || row.needs_review)
    .sort((a, b) => {
      const pa = a.check_priority === "high" ? 0 : a.check_priority === "normal" ? 1 : 2;
      const pb = b.check_priority === "high" ? 0 : b.check_priority === "normal" ? 1 : 2;
      if (pa !== pb) return pa - pb;
      const ma = toDateMs(a.last_match_at);
      const mb = toDateMs(b.last_match_at);
      if (ma !== mb) return mb - ma;
      return a.name.localeCompare(b.name, "ko");
    });

  const limited = filtered.slice(0, limit);
  const report = {
    generated_at: new Date().toISOString(),
    team_code: "fa",
    team_name: "무소속",
    total_fa_players: rows.length,
    excluded_count: rows.filter((row) => row.is_excluded).length,
    unresolved_count: rows.filter((row) => row.needs_review).length,
    returned_count: limited.length,
    include_resolved: includeResolved,
    players: limited,
  };

  fs.mkdirSync(REPORTS_DIR, { recursive: true });
  const jsonPath = path.join(REPORTS_DIR, "fa_tier_review_report.json");
  const txtPath = path.join(REPORTS_DIR, "fa_tier_review_report.txt");
  fs.writeFileSync(jsonPath, JSON.stringify(report, null, 2), "utf8");

  const lines = [
    `FA 티어 점검 대상 (${report.returned_count}/${report.unresolved_count})`,
    "",
  ];
  for (const row of limited) {
    const alias = row.display_name ? ` (${row.display_name})` : "";
    lines.push(
      `${row.name}${alias} | ${row.entity_id} | ${row.race} | last_match ${formatDate(row.last_match_at)} | priority ${row.check_priority}`
    );
  }
  fs.writeFileSync(txtPath, lines.join("\n"), "utf8");

  console.log(JSON.stringify({ ok: true, report_path: path.relative(ROOT, jsonPath).replace(/\\/g, "/"), ...report }, null, 2));
}

main();
