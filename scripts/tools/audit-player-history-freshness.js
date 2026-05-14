const fs = require("node:fs");
const path = require("node:path");
const { spawnSync } = require("node:child_process");
const { createClient } = require("@supabase/supabase-js");
require("dotenv").config({ path: path.join(__dirname, "..", "..", ".env.local") });

const ROOT = path.resolve(__dirname, "..", "..");
const PROJECTS_DIR = path.join(ROOT, "data", "metadata", "projects");
const EXCLUSIONS_FILE = path.join(ROOT, "data", "metadata", "pipeline_collection_exclusions.v1.json");
const REPORT_SCRIPT = path.join(ROOT, "scripts", "tools", "report-team-records.js");
const REPORTS_DIR = path.join(ROOT, "tmp", "reports");
const REPORT_JSON_PATH = path.join(REPORTS_DIR, "player_history_freshness_audit_latest.json");
const REPORT_MD_PATH = path.join(REPORTS_DIR, "player_history_freshness_audit_latest.md");

function relativePath(filePath) {
  return path.relative(ROOT, filePath).replace(/\\/g, "/");
}

function readJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, "utf8").replace(/^\uFEFF/, ""));
}

function normalizeDate(value) {
  const text = String(value || "").trim();
  const match = text.match(/^(\d{4}-\d{2}-\d{2})/);
  return match ? match[1] : "";
}

function normalizeText(value) {
  return String(value || "").trim();
}

function parseEntityId(entityId) {
  const match = String(entityId || "").match(/^eloboard:(male|female):(\d+)$/);
  if (!match) return null;
  return {
    gender: match[1],
    wr_id: Number(match[2]),
    serving_identity_key: `${match[1]}:${match[2]}`,
    eloboard_id: `eloboard:${match[1]}:${match[2]}`,
  };
}

function defaultProfileUrl({ gender, wr_id }) {
  if (!gender || !wr_id) return "";
  const section = gender === "female" ? "women" : "men";
  return `https://eloboard.com/${section}/bbs/board.php?bo_table=bj_list&wr_id=${wr_id}`;
}

function buildCandidateFromPlayer(player, projectDoc = {}) {
  const parsed = parseEntityId(player && player.entity_id);
  if (!parsed) return null;
  const teamCode = normalizeText(player.team_code || projectDoc.team_code || projectDoc.project);
  return {
    entity_id: normalizeText(player.entity_id),
    serving_identity_key: parsed.serving_identity_key,
    eloboard_id: parsed.eloboard_id,
    wr_id: Number(player.wr_id || parsed.wr_id),
    gender: normalizeText(player.gender || parsed.gender),
    team_code: teamCode || "unknown",
    team_name: normalizeText(player.team_name || projectDoc.team_name || teamCode || "unknown"),
    name: normalizeText(player.name || player.display_name),
    display_name: normalizeText(player.display_name || player.name),
    profile_url: normalizeText(player.profile_url) || defaultProfileUrl(parsed),
    tier: normalizeText(player.tier_key || player.tier),
    race: normalizeText(player.race),
    check_priority: normalizeText(player.check_priority) || "normal",
    check_interval_days: Number(player.check_interval_days || 0) || null,
    metadata_last_checked_at: normalizeText(player.last_checked_at) || null,
    metadata_last_match_at: normalizeDate(player.last_match_at) || null,
  };
}

function buildExclusionMatchers(rows = []) {
  return (Array.isArray(rows) ? rows : []).map((row) => {
    const wrId = Number(row && row.wr_id);
    const name = normalizeText(row && row.name).toLowerCase();
    const entityId = normalizeText(row && row.entity_id);
    const reason = normalizeText(row && row.reason) || "excluded";
    return {
      entity_id: entityId || null,
      wr_id: Number.isFinite(wrId) && wrId > 0 ? wrId : null,
      name: name || null,
      reason,
    };
  });
}

function loadExclusionMatchers(filePath = EXCLUSIONS_FILE) {
  if (!fs.existsSync(filePath)) return [];
  const doc = readJson(filePath);
  return buildExclusionMatchers(Array.isArray(doc.players) ? doc.players : []);
}

function findExclusionMatch(candidate, exclusionMatchers = []) {
  const entityId = normalizeText(candidate && candidate.eloboard_id);
  const wrId = Number(candidate && candidate.wr_id);
  const name = normalizeText(candidate && candidate.name).toLowerCase();
  for (const rule of Array.isArray(exclusionMatchers) ? exclusionMatchers : []) {
    if (!rule) continue;
    if (rule.entity_id) {
      if (entityId === rule.entity_id) return rule;
      continue;
    }
    if (rule.wr_id && rule.name && wrId === rule.wr_id && name === rule.name) return rule;
    if (rule.wr_id && wrId === rule.wr_id) return rule;
    if (rule.name && name === rule.name) return rule;
  }
  return null;
}

function mergeCandidate(existing, next) {
  if (!existing) return next;
  const existingDate = normalizeDate(existing.metadata_last_match_at);
  const nextDate = normalizeDate(next.metadata_last_match_at);
  const existingPriority = priorityRank(existing.check_priority);
  const nextPriority = priorityRank(next.check_priority);
  if (nextPriority < existingPriority) return next;
  if (nextPriority === existingPriority && nextDate > existingDate) return next;
  return existing;
}

function loadProjectCandidates(projectsDir = PROJECTS_DIR) {
  const byEntity = new Map();
  if (!fs.existsSync(projectsDir)) return [];

  for (const entry of fs.readdirSync(projectsDir, { withFileTypes: true })) {
    if (!entry.isDirectory()) continue;
    const teamCode = entry.name;
    const filePath = path.join(projectsDir, teamCode, `players.${teamCode}.v1.json`);
    if (!fs.existsSync(filePath)) continue;
    const doc = readJson(filePath);
    const roster = Array.isArray(doc.roster) ? doc.roster : [];
    for (const player of roster) {
      const candidate = buildCandidateFromPlayer(player, doc);
      if (!candidate) continue;
      byEntity.set(candidate.entity_id, mergeCandidate(byEntity.get(candidate.entity_id), candidate));
    }
  }

  return Array.from(byEntity.values()).sort(compareCandidates);
}

function priorityRank(value) {
  const priority = normalizeText(value).toLowerCase();
  if (priority === "high") return 0;
  if (priority === "normal") return 1;
  if (priority === "low") return 2;
  return 3;
}

function compareCandidates(a, b) {
  const priorityDiff = priorityRank(a.check_priority) - priorityRank(b.check_priority);
  if (priorityDiff !== 0) return priorityDiff;
  const aDate = normalizeDate(a.metadata_last_match_at) || "0000-00-00";
  const bDate = normalizeDate(b.metadata_last_match_at) || "0000-00-00";
  if (aDate !== bDate) return aDate.localeCompare(bDate);
  return a.serving_identity_key.localeCompare(b.serving_identity_key);
}

function filterCandidates(candidates, options = {}) {
  let rows = Array.isArray(candidates) ? candidates.slice().sort(compareCandidates) : [];
  if (options.team) rows = rows.filter((row) => row.team_code === options.team);
  if (options.priority) rows = rows.filter((row) => row.check_priority === options.priority);
  if (!options.all) {
    const limit = Number(options.limit || 25);
    rows = rows.slice(0, Number.isFinite(limit) && limit > 0 ? limit : 25);
  }
  return rows;
}

function filterVisibleCandidates(candidates, exclusionMatchers = []) {
  return (Array.isArray(candidates) ? candidates : []).filter(
    (candidate) => !findExclusionMatch(candidate, exclusionMatchers)
  );
}

function buildSourceReportArgs(candidate) {
  return [
    "--json-only",
    "--include-matches",
    "--no-cache",
    "--univ",
    String(candidate.team_code || "audit"),
    "--player",
    String(candidate.name || candidate.display_name || candidate.serving_identity_key),
    "--profile-url",
    String(candidate.profile_url || ""),
    "--wr-id",
    String(candidate.wr_id || ""),
    "--gender",
    String(candidate.gender || ""),
    "--tier",
    String(candidate.tier || ""),
  ];
}

function parseSourceLatestDate(doc) {
  const players = Array.isArray(doc && doc.players) ? doc.players : [];
  const first = players[0] || null;
  return normalizeDate(first && first.period_max_date);
}

function latestServingHistoryDate(row) {
  let latest = normalizeDate(row && row.last_match_at);
  const history = Array.isArray(row && row.match_history) ? row.match_history : [];
  for (const item of history) {
    const date = normalizeDate(item && item.match_date);
    if (date && date > latest) latest = date;
  }
  return latest;
}

function compareFreshness({ sourceLatestDate, servingLatestDate }) {
  const source = normalizeDate(sourceLatestDate);
  const serving = normalizeDate(servingLatestDate);
  if (!source) return { ok: false, status: "source_missing_latest_date" };
  if (!serving) return { ok: false, status: "serving_missing_latest_date" };
  if (serving < source) return { ok: false, status: "serving_older_than_source" };
  return { ok: true, status: "fresh" };
}

function readSourceReport(candidate) {
  const result = spawnSync(process.execPath, [REPORT_SCRIPT, ...buildSourceReportArgs(candidate)], {
    cwd: ROOT,
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
    maxBuffer: 64 * 1024 * 1024,
    timeout: 5 * 60 * 1000,
  });
  if (result.status !== 0) {
    throw new Error(
      String(result.stderr || result.stdout || "")
        .split(/\r?\n/)
        .filter(Boolean)
        .slice(-5)
        .join(" ")
    );
  }
  return JSON.parse(String(result.stdout || "").replace(/^\uFEFF/, ""));
}

function buildServingLookup(rows) {
  const byServingKey = new Map();
  const byEloboardId = new Map();
  for (const row of Array.isArray(rows) ? rows : []) {
    const servingKey = normalizeText(row && row.serving_identity_key);
    const eloboardId = normalizeText(row && row.eloboard_id);
    if (servingKey) byServingKey.set(servingKey, row);
    if (eloboardId) byEloboardId.set(eloboardId, row);
  }
  return { byServingKey, byEloboardId };
}

function buildAuditRow(candidate, servingRow, sourceResult, exclusionMatch = null) {
  const servingLatestDate = latestServingHistoryDate(servingRow);
  const sourceLatestDate = sourceResult && sourceResult.ok ? sourceResult.latestDate : "";
  const hasServingRow = Boolean(servingRow);
  const isExcluded = Boolean(exclusionMatch);
  const comparison = isExcluded
    ? hasServingRow
      ? { ok: false, status: "excluded_present_in_serving" }
      : { ok: true, status: "excluded_from_serving" }
    : sourceResult && sourceResult.checked
    ? compareFreshness({ sourceLatestDate, servingLatestDate })
    : hasServingRow
      ? { ok: true, status: "source_not_checked" }
      : { ok: false, status: "serving_row_missing" };
  const sourceError = sourceResult && sourceResult.error ? sourceResult.error : null;

  return {
    serving_identity_key: candidate.serving_identity_key,
    eloboard_id: candidate.eloboard_id,
    name: candidate.name,
    team_code: candidate.team_code,
    check_priority: candidate.check_priority,
    metadata_last_match_at: candidate.metadata_last_match_at,
    metadata_last_checked_at: candidate.metadata_last_checked_at,
    source_latest_date: sourceLatestDate || null,
    serving_latest_date: servingLatestDate || null,
    serving_last_synced_at: servingRow && servingRow.last_synced_at ? servingRow.last_synced_at : null,
    status: isExcluded ? comparison.status : !hasServingRow ? "serving_row_missing" : sourceError ? "source_read_failed" : comparison.status,
    ok: isExcluded ? comparison.ok : !hasServingRow ? false : sourceError ? false : comparison.ok,
    exclusion_reason: exclusionMatch && exclusionMatch.reason ? exclusionMatch.reason : null,
    source_error: sourceError,
  };
}

async function auditCandidates({ candidates, servingRows, includeSource = true, readSource = readSourceReport } = {}) {
  const lookup = buildServingLookup(servingRows);
  const exclusionMatchers = arguments[0] && arguments[0].exclusionMatchers ? arguments[0].exclusionMatchers : [];
  const rows = [];
  for (const candidate of candidates) {
    const servingRow =
      lookup.byServingKey.get(candidate.serving_identity_key) ||
      lookup.byEloboardId.get(candidate.eloboard_id) ||
      null;
    const exclusionMatch = findExclusionMatch(candidate, exclusionMatchers);
    let sourceResult = { checked: false, ok: true, latestDate: "" };
    if (includeSource && !exclusionMatch) {
      try {
        sourceResult = {
          checked: true,
          ok: true,
          latestDate: parseSourceLatestDate(readSource(candidate)),
        };
      } catch (error) {
        sourceResult = {
          checked: true,
          ok: false,
          latestDate: "",
          error: error instanceof Error ? error.message : String(error),
        };
      }
    }
    rows.push(buildAuditRow(candidate, servingRow, sourceResult, exclusionMatch));
  }
  return rows;
}

function summarizeRows(rows) {
  const countsByStatus = {};
  for (const row of rows) {
    countsByStatus[row.status] = (countsByStatus[row.status] || 0) + 1;
  }
  return {
    checked_players: rows.length,
    ok_players: rows.filter((row) => row.ok).length,
    problem_players: rows.filter((row) => !row.ok).length,
    counts_by_status: countsByStatus,
  };
}

function writeReports(report) {
  fs.mkdirSync(REPORTS_DIR, { recursive: true });
  fs.writeFileSync(REPORT_JSON_PATH, JSON.stringify(report, null, 2), "utf8");
  const lines = [
    "# Player History Freshness Audit",
    "",
    `- Generated: ${report.generated_at}`,
    `- Source checked: ${report.source_checked ? "yes" : "no"}`,
    `- Checked players: ${report.summary.checked_players}`,
    `- OK players: ${report.summary.ok_players}`,
    `- Problem players: ${report.summary.problem_players}`,
    "",
    "## Status Counts",
  ];
  for (const [status, count] of Object.entries(report.summary.counts_by_status)) {
    lines.push(`- ${status}: ${count}`);
  }
  const problemRows = report.players.filter((row) => !row.ok).slice(0, 30);
  if (problemRows.length) {
    lines.push("", "## Problem Players");
    for (const row of problemRows) {
      lines.push(
        `- ${row.serving_identity_key} ${row.name || ""} (${row.team_code}): ${row.status}, source=${row.source_latest_date || "-"}, serving=${row.serving_latest_date || "-"}`
      );
    }
  }
  fs.writeFileSync(REPORT_MD_PATH, lines.join("\n"), "utf8");
}

function resolveSupabaseEnv(env = process.env) {
  return {
    supabaseUrl: normalizeText(env.NEXT_PUBLIC_SUPABASE_URL),
    serviceKey: normalizeText(env.SUPABASE_SERVICE_ROLE_KEY || env.SUPABASE_SERVICE_KEY),
  };
}

async function readServingRows(client) {
  const { data, error } = await client
    .from("players")
    .select("id,name,eloboard_id,serving_identity_key,last_match_at,match_history,last_synced_at");
  if (error) throw error;
  return data || [];
}

async function runAudit(options = {}) {
  const { supabaseUrl, serviceKey } = resolveSupabaseEnv(options.env || process.env);
  if (!options.client && (!supabaseUrl || !serviceKey)) {
    throw new Error("Missing Supabase env for player-history freshness audit.");
  }
  const client =
    options.client ||
    createClient(supabaseUrl, serviceKey, {
      auth: { persistSession: false, autoRefreshToken: false },
    });
  const allCandidates = options.candidates || loadProjectCandidates(options.projectsDir || PROJECTS_DIR);
  const servingRows = options.servingRows || (await readServingRows(client));
  const exclusionMatchers = options.exclusionMatchers || loadExclusionMatchers(options.exclusionsFile || EXCLUSIONS_FILE);
  const candidatePool = options.visibleOnly ? filterVisibleCandidates(allCandidates, exclusionMatchers) : allCandidates;
  const candidates = filterCandidates(candidatePool, options);
  const rows = await auditCandidates({
    candidates,
    servingRows,
    includeSource: options.includeSource !== false,
    readSource: options.readSource || readSourceReport,
    exclusionMatchers,
  });
  const report = {
    generated_at: new Date().toISOString(),
    source_checked: options.includeSource !== false,
    candidate_count: allCandidates.length,
    checked_count: candidates.length,
    summary: summarizeRows(rows),
    players: rows,
  };
  writeReports(report);
  return report;
}

function argValue(flag, fallback = null) {
  const idx = process.argv.indexOf(flag);
  if (idx >= 0 && process.argv[idx + 1]) return process.argv[idx + 1];
  return fallback;
}

function hasFlag(flag) {
  return process.argv.includes(flag);
}

async function main() {
  const report = await runAudit({
    all: hasFlag("--all"),
    limit: Number(argValue("--limit", "25")),
    team: argValue("--team", ""),
    priority: argValue("--priority", ""),
    includeSource: !hasFlag("--no-source"),
    visibleOnly: hasFlag("--visible-only"),
  });
  if (hasFlag("--json-full")) {
    console.log(JSON.stringify(report, null, 2));
  } else {
    console.log(
      JSON.stringify(
        {
          ok: report.summary.problem_players === 0,
          source_checked: report.source_checked,
          candidate_count: report.candidate_count,
          checked_count: report.checked_count,
          summary: report.summary,
          report_json: relativePath(REPORT_JSON_PATH),
          report_md: relativePath(REPORT_MD_PATH),
        },
        null,
        2
      )
    );
  }
  if (hasFlag("--fail-on-stale") && report.summary.problem_players > 0) {
    process.exit(1);
  }
}

if (require.main === module) {
  main().catch((error) => {
    if (error instanceof Error) {
      console.error(error.stack || error.message);
    } else {
      console.error(JSON.stringify(error, null, 2));
    }
    process.exit(1);
  });
}

module.exports = {
  auditCandidates,
  buildCandidateFromPlayer,
  buildExclusionMatchers,
  buildSourceReportArgs,
  compareFreshness,
  filterCandidates,
  filterVisibleCandidates,
  findExclusionMatch,
  latestServingHistoryDate,
  loadProjectCandidates,
  normalizeDate,
  parseEntityId,
  parseSourceLatestDate,
  runAudit,
  summarizeRows,
};
