const fs = require("fs");
const path = require("path");
const { execFileSync } = require("child_process");
const { defaultProfileUrlForPlayer } = require("./lib/eloboard-special-cases");
const { ensureAutoDiscoveredTeamProjects } = require("./lib/team-project-discovery");
const {
  isComparablePriorSnapshot,
  latestPreviousSnapshotPath,
  parseDateTag,
} = require("./lib/daily-pipeline-snapshot");

const ROOT = path.resolve(__dirname, "..", "..");
const TMP_DIR = path.join(ROOT, "tmp");
const REPORTS_DIR = path.join(TMP_DIR, "reports");
const HOMEPAGE_INTEGRITY_REPORT_PATH = path.join(REPORTS_DIR, "homepage_integrity_report.json");
const NODE_BIN = process.execPath || "node";
const ALERT_RULES_PATH = path.join(ROOT, "data", "metadata", "pipeline_alert_rules.v1.json");
const EXPORT_SCRIPT = path.join(ROOT, "scripts", "tools", "export-team-roster-detailed.js");
const REPORT_SCRIPT = path.join(ROOT, "scripts", "tools", "report-team-records.js");
const CSV_SCRIPT = path.join(ROOT, "scripts", "tools", "export-player-matches-csv.js");
const EXPORT_METADATA_SCRIPT = path.join(ROOT, "scripts", "tools", "export-team-roster-metadata.js");
const ORGANIZE_SCRIPT = path.join(ROOT, "scripts", "tools", "organize-generated-artifacts.js");
const TEAM_TABLE_SCRIPT = path.join(ROOT, "scripts", "tools", "report-team-roster-table.js");
const ROSTER_SYNC_SCRIPT = path.join(ROOT, "scripts", "tools", "sync-team-roster-metadata.js");
const DISPLAY_ALIAS_SCRIPT = path.join(ROOT, "scripts", "tools", "apply-player-display-aliases.js");
const TEAM_TABLE_OUT_DIR = path.join(TMP_DIR, "reports", "team-roster-table");
const NODE_BIN_FALLBACK = "node";
const MANUAL_REFRESH_BASELINE_PATH = path.join(REPORTS_DIR, "manual_refresh_baseline.json");
const COLLECTION_EXCLUSIONS_PATH = path.join(ROOT, "data", "metadata", "pipeline_collection_exclusions.v1.json");
const MANUAL_OVERRIDES_PATH = path.join(ROOT, "data", "metadata", "roster_manual_overrides.v1.json");
let ACTIVE_PROGRESS_LOG_PATH = null;
const TEAM_EXPORT_TIMEOUT_MS = 900000;
const FA_EXPORT_TIMEOUT_MS = 1800000;
const FA_EXPORT_CONCURRENCY = "2";

function argValue(flag, fallback = null) {
  const idx = process.argv.indexOf(flag);
  if (idx >= 0 && process.argv[idx + 1]) return process.argv[idx + 1];
  return fallback;
}

function isChunkedDateTag(value) {
  return /-chunk\d+$/i.test(String(value || "").trim());
}

function hasFlag(flag) {
  return process.argv.includes(flag);
}

function today() {
  return new Intl.DateTimeFormat("sv-SE", {
    timeZone: "Asia/Seoul",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());
}

function ensureDir(p) {
  fs.mkdirSync(p, { recursive: true });
}

function readJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, "utf8").replace(/^\uFEFF/, ""));
}

function readJsonIfExists(filePath, fallback = null) {
  if (!fs.existsSync(filePath)) return fallback;
  try {
    return readJson(filePath);
  } catch {
    return fallback;
  }
}

function loadTeamConfig() {
  const projectsDir = path.join(ROOT, "data", "metadata", "projects");
  if (!fs.existsSync(projectsDir)) return [];
  const dirs = fs
    .readdirSync(projectsDir, { withFileTypes: true })
    .filter((d) => d.isDirectory())
    .map((d) => d.name)
    .sort((a, b) => String(a).localeCompare(String(b)));

  const teams = [];
  for (const code of dirs) {
    const rosterPath = path.join("data", "metadata", "projects", code, `players.${code}.v1.json`);
    const fullPath = path.join(ROOT, rosterPath);
    if (!fs.existsSync(fullPath)) continue;
    const json = readJson(fullPath);
    if (json.manual_managed) continue;
    teams.push({
      code,
      univ: String(json.fetch_univ_name || json.team_name || code),
      rosterPath: rosterPath.replace(/\\/g, "/"),
    });
  }
  return teams;
}

function exportConcurrencyForTeam(teamCode, fallbackConcurrency) {
  if (String(teamCode || "").trim().toLowerCase() === "fa") {
    const requested = Number(fallbackConcurrency);
    const minimum = Number(FA_EXPORT_CONCURRENCY);
    if (Number.isFinite(requested) && requested > minimum) return String(requested);
    return FA_EXPORT_CONCURRENCY;
  }
  return String(fallbackConcurrency);
}

function exportTimeoutForTeam(teamCode) {
  return String(teamCode || "").trim().toLowerCase() === "fa" ? FA_EXPORT_TIMEOUT_MS : TEAM_EXPORT_TIMEOUT_MS;
}

function baselineTeamPlayerMap(baselineDoc) {
  const teams = Array.isArray(baselineDoc && baselineDoc.teams) ? baselineDoc.teams : [];
  return new Map(
    teams.map((team) => [String(team && team.team_code ? team.team_code : ""), Array.isArray(team.players) ? team.players : []])
  );
}

function currentRosterEntityIds(teamCode) {
  const filePath = path.join(ROOT, "data", "metadata", "projects", teamCode, `players.${teamCode}.v1.json`);
  const teamDoc = readJsonIfExists(filePath, null);
  const roster = Array.isArray(teamDoc && teamDoc.roster) ? teamDoc.roster : [];
  return roster
    .map((player) => String(player && player.entity_id ? player.entity_id : "").trim())
    .filter(Boolean);
}

function summarizeRosterTransitions(teamConfig, baselineDoc) {
  const baselineByTeam = baselineTeamPlayerMap(baselineDoc);
  const summaries = [];
  for (const team of teamConfig) {
    const code = String(team && team.code ? team.code : "");
    if (!code) continue;
    const baselinePlayers = baselineByTeam.get(code) || [];
    const baselineIds = new Set(
      baselinePlayers.map((player) => String(player && player.entity_id ? player.entity_id : "").trim()).filter(Boolean)
    );
    const currentIds = new Set(currentRosterEntityIds(code));
    const added = [...currentIds].filter((id) => !baselineIds.has(id)).sort();
    const removed = [...baselineIds].filter((id) => !currentIds.has(id)).sort();
    summaries.push({
      team: team.univ,
      team_code: code,
      baseline_players: baselineIds.size,
      current_players: currentIds.size,
      added_entity_ids: added,
      removed_entity_ids: removed,
      changed: added.length > 0 || removed.length > 0,
    });
  }
  return summaries;
}

function writeJson(filePath, obj) {
  ensureDir(path.dirname(filePath));
  fs.writeFileSync(filePath, JSON.stringify(obj, null, 2), "utf8");
}

function appendProgress(event, payload = {}) {
  if (!ACTIVE_PROGRESS_LOG_PATH) return;
  ensureDir(path.dirname(ACTIVE_PROGRESS_LOG_PATH));
  fs.appendFileSync(
    ACTIVE_PROGRESS_LOG_PATH,
    `${JSON.stringify({ ts: new Date().toISOString(), event, ...payload })}\n`,
    "utf8"
  );
}

function writeCsv(filePath, rows) {
  ensureDir(path.dirname(filePath));
  if (!rows.length) {
    fs.writeFileSync(filePath, "", "utf8");
    return;
  }
  const headers = Object.keys(rows[0]);
  const esc = (v) => {
    const s = String(v ?? "");
    return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  const lines = [
    headers.join(","),
    ...rows.map((row) => headers.map((h) => esc(row[h])).join(",")),
  ];
  fs.writeFileSync(filePath, lines.join("\n"), "utf8");
}

function defaultAlertConfig() {
  return {
    schema_version: "1.0.0",
    updated_at: new Date().toISOString(),
    blocking_severities: ["critical", "high"],
    rules: {
      pipeline_failure_severity: "critical",
      zero_record_players_severity: "high",
      zero_record_players_allowlist: {},
      zero_record_players_team_allowlist: [],
      negative_delta_matches_severity: "critical",
      roster_size_changed_severity: "medium",
      roster_size_changed_team_allowlist: [],
      clustered_uncertain_affiliation_changes_severity: "medium",
      clustered_uncertain_affiliation_changes_threshold: 3,
      stale_snapshot_disagreement_severity: "medium",
      stale_snapshot_disagreement_threshold: 1,
      homepage_integrity_report_max_age_minutes: 180,
      no_new_matches_enabled: false,
      no_new_matches_severity: "low",
    },
  };
}

function readAlertConfig() {
  if (!fs.existsSync(ALERT_RULES_PATH)) return defaultAlertConfig();
  try {
    const raw = fs.readFileSync(ALERT_RULES_PATH, "utf8").replace(/^\uFEFF/, "");
    const parsed = JSON.parse(raw);
    return {
      ...defaultAlertConfig(),
      ...parsed,
      rules: {
        ...defaultAlertConfig().rules,
        ...(parsed && parsed.rules ? parsed.rules : {}),
      },
      blocking_severities: Array.isArray(parsed && parsed.blocking_severities)
        ? parsed.blocking_severities
        : defaultAlertConfig().blocking_severities,
    };
  } catch {
    return defaultAlertConfig();
  }
}

function severityRank(level) {
  if (level === "critical") return 4;
  if (level === "high") return 3;
  if (level === "medium") return 2;
  if (level === "low") return 1;
  return 0;
}

function sortedAlerts(alerts) {
  return alerts.slice().sort((a, b) => {
    const ar = severityRank(a.severity);
    const br = severityRank(b.severity);
    if (ar !== br) return br - ar;
    if (a.team_code !== b.team_code) return String(a.team_code).localeCompare(String(b.team_code));
    return String(a.rule).localeCompare(String(b.rule));
  });
}

function normalizeOpsAlertTeams(alerts) {
  return (Array.isArray(alerts) ? alerts : []).map((alert) => {
    if (!alert || String(alert.team_code || "").trim() !== "ops") return alert;
    const rule = String(alert.rule || "").trim();
    return {
      ...alert,
      team: rule === "stale_live_snapshot_disagreement" ? "\uC6B4\uC601" : "\u003F\uB301\uC07A",
    };
  });
}

function normalizePositiveNumber(value, fallback) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed < 0) return fallback;
  return parsed;
}

function buildHomepageIntegrityOperationalAlertsLegacy(homepageIntegrityReport, cfg, referenceTimeMs = Date.now()) {
  return buildHomepageIntegrityOperationalAlerts(homepageIntegrityReport, cfg, referenceTimeMs);
  const rules = cfg && cfg.rules && typeof cfg.rules === "object" ? cfg.rules : {};
  if (!homepageIntegrityReport || typeof homepageIntegrityReport !== "object") return [];

  const generatedAt = String(homepageIntegrityReport.generated_at || "").trim();
  const generatedTime = generatedAt ? Date.parse(generatedAt) : Number.NaN;
  if (!Number.isFinite(generatedTime)) return [];

  const maxAgeMinutes = normalizePositiveNumber(rules.homepage_integrity_report_max_age_minutes, 180);
  const reportAgeMs = referenceTimeMs - generatedTime;
  if (!Number.isFinite(reportAgeMs) || reportAgeMs < 0 || reportAgeMs > maxAgeMinutes * 60 * 1000) {
    return [];
  }

  const liveSummary =
    homepageIntegrityReport.summary && homepageIntegrityReport.summary.live && typeof homepageIntegrityReport.summary.live === "object"
      ? homepageIntegrityReport.summary.live
      : null;
  if (!liveSummary) return [];

  const disagreementCount = Number(liveSummary.stale_snapshot_disagreement_count || 0);
  const snapshotIsFresh = Boolean(liveSummary.snapshot_is_fresh);
  const snapshotExists = Boolean(liveSummary.snapshot_exists);
  const threshold = normalizePositiveNumber(rules.stale_snapshot_disagreement_threshold, 1);

  const alerts = [];

  if (snapshotExists && !snapshotIsFresh && Number.isFinite(disagreementCount) && disagreementCount >= threshold) {
    alerts.push({
      severity: rules.stale_snapshot_disagreement_severity || "medium",
      team: "운영",
      team_code: "ops",
      rule: "stale_live_snapshot_disagreement",
      message: `stale_snapshot_disagreement_count=${disagreementCount}, snapshot_updated_at=${String(
        liveSummary.snapshot_updated_at || "-"
      )}, report_generated_at=${generatedAt}`,
    });
  }

  const heroMediaSummary =
    homepageIntegrityReport.summary &&
    homepageIntegrityReport.summary.hero_media &&
    typeof homepageIntegrityReport.summary.hero_media === "object"
      ? homepageIntegrityReport.summary.hero_media
      : null;

  if (heroMediaSummary) {
    const activeOk = Boolean(heroMediaSummary.active_ok);
    const activeCount = Number(heroMediaSummary.active_count || 0);
    const invalidRowsCount = Number(heroMediaSummary.invalid_rows_count || 0);
    const activeIssues = Array.isArray(heroMediaSummary.active_issues)
      ? heroMediaSummary.active_issues
          .map((item) => String(item || "").trim())
          .filter(Boolean)
      : [];

    if (!activeOk || (Number.isFinite(invalidRowsCount) && invalidRowsCount > 0)) {
      alerts.push({
        severity: rules.hero_media_integrity_severity || "medium",
        team: "운영팀",
        team_code: "ops",
        rule: "hero_media_integrity_issue",
        message: `active_count=${Number.isFinite(activeCount) ? activeCount : 0}, invalid_rows=${Number.isFinite(
          invalidRowsCount
        ) ? invalidRowsCount : 0}, issues=${activeIssues.length ? activeIssues.join(",") : "-"}`,
      });
    }
  }

  return alerts;
}

function buildHomepageIntegrityOperationalAlerts(homepageIntegrityReport, cfg, referenceTimeMs = Date.now()) {
  const rules = cfg && cfg.rules && typeof cfg.rules === "object" ? cfg.rules : {};
  if (!homepageIntegrityReport || typeof homepageIntegrityReport !== "object") return [];

  const generatedAt = String(homepageIntegrityReport.generated_at || "").trim();
  const generatedTime = generatedAt ? Date.parse(generatedAt) : Number.NaN;
  if (!Number.isFinite(generatedTime)) return [];

  const maxAgeMinutes = normalizePositiveNumber(rules.homepage_integrity_report_max_age_minutes, 180);
  const reportAgeMs = referenceTimeMs - generatedTime;
  if (!Number.isFinite(reportAgeMs) || reportAgeMs < 0 || reportAgeMs > maxAgeMinutes * 60 * 1000) {
    return [];
  }

  const liveSummary =
    homepageIntegrityReport.summary && homepageIntegrityReport.summary.live && typeof homepageIntegrityReport.summary.live === "object"
      ? homepageIntegrityReport.summary.live
      : null;
  if (!liveSummary) return [];

  const disagreementCount = Number(liveSummary.stale_snapshot_disagreement_count || 0);
  const snapshotIsFresh = Boolean(liveSummary.snapshot_is_fresh);
  const snapshotExists = Boolean(liveSummary.snapshot_exists);
  const threshold = normalizePositiveNumber(rules.stale_snapshot_disagreement_threshold, 1);

  if (!snapshotExists || snapshotIsFresh || !Number.isFinite(disagreementCount) || disagreementCount < threshold) {
    return [];
  }

  return normalizeOpsAlertTeams([
    {
      severity: rules.stale_snapshot_disagreement_severity || "medium",
      team: "ìš´ì˜",
      team_code: "ops",
      rule: "stale_live_snapshot_disagreement",
      message: `stale_snapshot_disagreement_count=${disagreementCount}, snapshot_updated_at=${String(
        liveSummary.snapshot_updated_at || "-"
      )}, report_generated_at=${generatedAt}`,
    },
  ]);
}

function buildClusteredUncertainAffiliationAlerts(rosterSyncReport, cfg) {
  const rules = cfg && cfg.rules && typeof cfg.rules === "object" ? cfg.rules : {};
  const threshold = normalizePositiveNumber(rules.clustered_uncertain_affiliation_changes_threshold, 3);
  if (!Number.isFinite(threshold) || threshold <= 0) return [];

  const moved =
    rosterSyncReport &&
    rosterSyncReport.summary &&
    Array.isArray(rosterSyncReport.summary.moved)
      ? rosterSyncReport.summary.moved
      : [];
  const uncertainRows = moved.filter((row) => {
    const confidence = String(row && row.change_confidence ? row.change_confidence : "").trim().toLowerCase();
    return confidence === "fallback" || confidence === "inferred";
  });

  if (uncertainRows.length < threshold) return [];

  const counts = { fallback: 0, inferred: 0 };
  const previousTeams = new Map();
  for (const row of uncertainRows) {
    const confidence = String(row && row.change_confidence ? row.change_confidence : "").trim().toLowerCase();
    if (confidence === "fallback" || confidence === "inferred") {
      counts[confidence] += 1;
    }
    const previousTeam = String(row && row.from ? row.from : "").trim() || "unknown";
    previousTeams.set(previousTeam, Number(previousTeams.get(previousTeam) || 0) + 1);
  }

  const previousTeamsSummary = Array.from(previousTeams.entries())
    .sort((a, b) => b[1] - a[1] || String(a[0]).localeCompare(String(b[0])))
    .slice(0, 3)
    .map(([teamCode, count]) => `${teamCode}:${count}`)
    .join(", ");

  return normalizeOpsAlertTeams([
    {
      severity: rules.clustered_uncertain_affiliation_changes_severity || "medium",
      team: "?댁쁺",
      team_code: "ops",
      rule: "clustered_uncertain_affiliation_changes",
      message: `count=${uncertainRows.length}, fallback=${counts.fallback}, inferred=${counts.inferred}, previous_teams=${previousTeamsSummary || "-"}`,
    },
  ]);
}

function runNode(scriptPath, args, options = {}) {
  const label = String(options.label || path.basename(scriptPath));
  const timeoutMs = Number(options.timeoutMs || 600000);
  const startedAt = Date.now();
  console.log(`[STEP] start ${label}`);
  appendProgress("step_start", {
    label,
    script: path.relative(ROOT, scriptPath).replace(/\\/g, "/"),
    args,
    timeout_ms: timeoutMs,
  });
  try {
    const output = execFileSync(NODE_BIN, [scriptPath, ...args], {
      cwd: ROOT,
      encoding: "utf8",
      stdio: ["ignore", "pipe", "pipe"],
      maxBuffer: 50 * 1024 * 1024,
      timeout: timeoutMs,
    });
    const elapsedMs = Date.now() - startedAt;
    console.log(`[STEP] done ${label} elapsed=${elapsedMs}ms`);
    appendProgress("step_done", { label, elapsed_ms: elapsedMs });
    return output;
  } catch (error) {
    const code = error && typeof error === "object" ? String(error.code || "") : "";
    if (code === "EPERM" && NODE_BIN !== NODE_BIN_FALLBACK) {
      const output = execFileSync(NODE_BIN_FALLBACK, [scriptPath, ...args], {
        cwd: ROOT,
        encoding: "utf8",
        stdio: ["ignore", "pipe", "pipe"],
        maxBuffer: 50 * 1024 * 1024,
        timeout: timeoutMs,
      });
      const elapsedMs = Date.now() - startedAt;
      console.log(`[STEP] done ${label} elapsed=${elapsedMs}ms fallback=node`);
      appendProgress("step_done", { label, elapsed_ms: elapsedMs, fallback: true });
      return output;
    }
    const elapsedMs = Date.now() - startedAt;
    const message = error instanceof Error ? error.message : String(error);
    console.error(`[STEP] fail ${label} elapsed=${elapsedMs}ms error=${message}`);
    appendProgress("step_fail", {
      label,
      elapsed_ms: elapsedMs,
      code: error && typeof error === "object" ? String(error.code || "") : "",
      signal: error && typeof error === "object" ? String(error.signal || "") : "",
      killed: Boolean(error && typeof error === "object" && error.killed),
      message,
    });
    throw error;
  }
}

function withDeltaRows(rows, priorMap, canCompare) {
  return rows.map((row) => {
    const prev = canCompare ? priorMap.get(row.team_code) : null;
    return {
      ...row,
      delta_total_matches: prev ? row.total_matches - Number(prev.total_matches || 0) : null,
      delta_total_wins: prev ? row.total_wins - Number(prev.total_wins || 0) : null,
      delta_total_losses: prev ? row.total_losses - Number(prev.total_losses || 0) : null,
      delta_players: prev ? row.players - Number(prev.players || 0) : null,
    };
  });
}

function summarizeTeamFromReport(team, report) {
  const results = Array.isArray(report.results) ? report.results : [];
  const actionable = results.filter((row) => !row.excluded);
  const excludedPlayers = results.filter((row) => row.excluded).map((row) => String(row.player || ""));
  const fetchedPlayers = actionable.filter((row) => String(row.fetch_status || "") === "ok").length;
  const reusedPlayers = actionable.filter((row) =>
    [
      "used_existing_json",
      "used_existing_json_inactive",
      "used_existing_json_priority_window",
      "used_existing_json_regression_guard",
    ].includes(String(row.fetch_status || ""))
  ).length;
  let totalMatches = 0;
  let totalWins = 0;
  let totalLosses = 0;
  const zeroPlayers = [];
  const failures = [];

  for (const row of actionable) {
    const fetchOkStates = new Set([
      "ok",
      "used_existing_json",
      "used_existing_json_inactive",
      "used_existing_json_priority_window",
      "used_existing_json_regression_guard",
    ]);
    const fetchFail = !fetchOkStates.has(String(row.fetch_status || ""));
    const csvFail = !["ok", "used_existing_csv"].includes(String(row.csv_status || ""));
    if (fetchFail || csvFail) {
      failures.push({
        player: row.player,
        fetch_status: row.fetch_status,
        csv_status: row.csv_status,
        error: row.error || "",
      });
    }
    const jsonPath = String(row.json_path || "");
    if (!jsonPath || !fs.existsSync(jsonPath)) continue;
    const doc = readJson(jsonPath);
    const player = Array.isArray(doc.players) ? doc.players[0] : null;
    if (!player) continue;
    const t = Number(player.period_total || 0);
    const w = Number(player.period_wins || 0);
    const l = Number(player.period_losses || 0);
    totalMatches += t;
    totalWins += w;
    totalLosses += l;
    if (t === 0) zeroPlayers.push(String(row.player || ""));
  }

  return {
    team: team.univ,
    team_code: team.code,
    players: actionable.length,
    excluded_players: excludedPlayers.length,
    excluded_player_names: excludedPlayers.join(", "),
    fetched_players: fetchedPlayers,
    reused_players: reusedPlayers,
    fetch_fail: failures.filter(
      (f) =>
        ![
          "ok",
          "used_existing_json",
          "used_existing_json_inactive",
          "used_existing_json_priority_window",
          "used_existing_json_regression_guard",
        ].includes(String(f.fetch_status || ""))
    ).length,
    csv_fail: failures.filter((f) => !["ok", "used_existing_csv"].includes(String(f.csv_status || ""))).length,
    total_matches: totalMatches,
    total_wins: totalWins,
    total_losses: totalLosses,
    zero_record_players: zeroPlayers.length,
    zero_players: zeroPlayers.join(", "),
    failures,
  };
}

function getRowPeriodTotal(row) {
  const jsonPath = String(row && row.json_path ? row.json_path : "");
  if (!jsonPath || !fs.existsSync(jsonPath)) return 0;
  const doc = readJson(jsonPath);
  const player = Array.isArray(doc.players) ? doc.players[0] : null;
  if (!player) return 0;
  return Number(player.period_total || 0);
}

function generateTeamTableReports(teams) {
  const teamCodes = teams.map((t) => t.code).join(",");
  try {
    const raw = runNode(TEAM_TABLE_SCRIPT, ["--teams", teamCodes, "--out-dir", TEAM_TABLE_OUT_DIR], {
      label: "team_table_report",
      timeoutMs: 120000,
    }).trim();
    let parsed = null;
    try {
      parsed = JSON.parse(raw);
    } catch {
      parsed = null;
    }
    return {
      ok: true,
      out_dir: path.relative(ROOT, TEAM_TABLE_OUT_DIR).replace(/\\/g, "/"),
      summary: parsed,
    };
  } catch (error) {
    return {
      ok: false,
      out_dir: path.relative(ROOT, TEAM_TABLE_OUT_DIR).replace(/\\/g, "/"),
      error: error.message,
    };
  }
}

function runRosterSync(teams, totalTeamCount) {
  const teamCodes = teams.map((t) => t.code).join(",");
  const isFullSync = Number(totalTeamCount || 0) > 0 && teams.length === Number(totalTeamCount);
  const args = isFullSync
    ? []
    : ["--teams", teamCodes, "--allow-partial"];
  try {
    const raw = runNode(ROSTER_SYNC_SCRIPT, args, {
      label: `roster_sync:${teamCodes || "all"}`,
      timeoutMs: 300000,
    }).trim();
    let parsed = null;
    try {
      parsed = JSON.parse(raw);
    } catch {
      parsed = null;
    }
    return { ok: true, summary: parsed };
  } catch (error) {
    return { ok: false, error: error.message };
  }
}

function ensureFaRecordMetadata(teams) {
  const faTeam = teams.find((t) => t.code === "fa");
  if (!faTeam) return { ok: true, skipped: true };

  const candidates = [
    path.join(TMP_DIR, "무소속_roster_record_metadata.json"),
    path.join(TMP_DIR, "연합팀_roster_record_metadata.json"),
    path.join(TMP_DIR, "fa_roster_record_metadata.json"),
  ];
  if (candidates.some((p) => fs.existsSync(p))) {
    return { ok: true, generated: false, source_univ: faTeam.univ };
  }

  try {
    runNode(EXPORT_METADATA_SCRIPT, ["--univ", faTeam.univ], {
      label: `fa_record_metadata:${faTeam.univ}`,
      timeoutMs: 180000,
    });
    return { ok: true, generated: true, source_univ: faTeam.univ };
  } catch (error) {
    return {
      ok: false,
      generated: false,
      source_univ: faTeam.univ,
      error: error instanceof Error ? error.message : String(error),
    };
  }
}

function applyDisplayAliasesForTeams(teams) {
  const rows = [];
  for (const team of teams) {
    try {
      const raw = runNode(DISPLAY_ALIAS_SCRIPT, ["--project", team.code], {
        label: `display_alias:${team.code}`,
        timeoutMs: 120000,
      }).trim();
      let parsed = null;
      try {
        parsed = JSON.parse(raw);
      } catch {
        parsed = null;
      }
      rows.push({
        team_code: team.code,
        ok: true,
        summary: parsed,
      });
    } catch (error) {
      rows.push({
        team_code: team.code,
        ok: false,
        error: error.message,
      });
    }
  }
  return {
    ok: rows.every((r) => r.ok),
    teams: rows,
  };
}

function movedInPlayersByTeam(rosterSyncReport) {
  const map = new Map();
  const moved = Array.isArray(rosterSyncReport && rosterSyncReport.summary && rosterSyncReport.summary.moved)
    ? rosterSyncReport.summary.moved
    : [];
  for (const row of moved) {
    const teamCode = String(row && row.to ? row.to : "").trim();
    const playerName = String(row && row.name ? row.name : "").trim();
    if (!teamCode || !playerName) continue;
    if (!map.has(teamCode)) map.set(teamCode, new Set());
    map.get(teamCode).add(playerName);
  }
  return map;
}

function splitZeroPlayers(raw) {
  return String(raw || "")
    .split(",")
    .map((v) => v.trim())
    .filter(Boolean);
}

function loadCollectionExclusionLookup() {
  const doc = readJsonIfExists(COLLECTION_EXCLUSIONS_PATH, { players: [] });
  const rows = Array.isArray(doc && doc.players) ? doc.players : [];
  const lookup = new Map();
  for (const row of rows) {
    const name = String(row && row.name ? row.name : "").trim();
    if (!name) continue;
    lookup.set(name, {
      reason: String(row && row.reason ? row.reason : "excluded_from_collection"),
      wr_id: Number(row && row.wr_id ? row.wr_id : 0) || null,
      entity_id: String(row && row.entity_id ? row.entity_id : "").trim() || null,
    });
  }
  return lookup;
}

function loadManualOverrideLookup() {
  const doc = readJsonIfExists(MANUAL_OVERRIDES_PATH, { overrides: [] });
  const rows = Array.isArray(doc && doc.overrides) ? doc.overrides : [];
  const lookup = new Map();
  for (const row of rows) {
    const name = String(row && row.name ? row.name : "").trim();
    if (!name) continue;
    lookup.set(name, {
      note: String(row && row.note ? row.note : "").trim(),
      entity_id: String(row && row.entity_id ? row.entity_id : "").trim() || null,
      team_code: String(row && row.team_code ? row.team_code : "").trim() || null,
    });
  }
  return lookup;
}

function loadManualAliasConflictLookup() {
  const doc = readJsonIfExists(MANUAL_OVERRIDES_PATH, { overrides: [] });
  const rows = Array.isArray(doc && doc.overrides) ? doc.overrides : [];
  const lookup = new Map();
  for (const row of rows) {
    const note = String(row && row.note ? row.note : "").trim();
    if (!note.includes("Alias conflict")) continue;
    const match = note.match(/FA alias\s+([^.\s]+)/i);
    if (!match) continue;
    const aliasName = String(match[1] || "").trim();
    if (!aliasName) continue;
    lookup.set(aliasName, note);
  }
  return lookup;
}

function classifyZeroRecordPlayers(rowsWithDelta, cfg) {
  const rules = cfg && cfg.rules ? cfg.rules : {};
  const zeroRecordAllowlist =
    rules && rules.zero_record_players_allowlist && typeof rules.zero_record_players_allowlist === "object"
      ? rules.zero_record_players_allowlist
      : {};
  const teamAllowlist = new Set(
    Array.isArray(rules && rules.zero_record_players_team_allowlist)
      ? rules.zero_record_players_team_allowlist.map((value) => String(value || "").trim())
      : []
  );
  const collectionExclusions = loadCollectionExclusionLookup();
  const manualOverrides = loadManualOverrideLookup();
  const manualAliasConflicts = loadManualAliasConflictLookup();
  const players = [];

  for (const teamRow of Array.isArray(rowsWithDelta) ? rowsWithDelta : []) {
    const teamCode = String(teamRow && teamRow.team_code ? teamRow.team_code : "").trim();
    const teamName = String(teamRow && teamRow.team ? teamRow.team : teamCode).trim();
    const playerAllowlist = new Set(
      Array.isArray(zeroRecordAllowlist[teamCode])
        ? zeroRecordAllowlist[teamCode].map((value) => String(value || "").trim())
        : []
    );

    for (const playerName of splitZeroPlayers(teamRow && teamRow.zero_players ? teamRow.zero_players : "")) {
      let category = "needs_review";
      let reason = "unclassified_zero_record";
      if (teamAllowlist.has(teamCode)) {
        category = "team_allowlisted";
        reason = "zero_record_team_allowlist";
      } else if (playerAllowlist.has(playerName)) {
        category = "player_allowlisted";
        reason = "zero_record_player_allowlist";
      } else if (collectionExclusions.has(playerName)) {
        category = "collection_excluded";
        reason = collectionExclusions.get(playerName).reason;
      } else if (manualAliasConflicts.has(playerName)) {
        category = "manual_alias_conflict";
        reason = manualAliasConflicts.get(playerName);
      } else if (manualOverrides.has(playerName)) {
        const override = manualOverrides.get(playerName);
        if (String(override && override.note ? override.note : "").includes("Alias conflict")) {
          category = "manual_alias_conflict";
          reason = override.note;
        }
      }

      players.push({
        team_code: teamCode,
        team: teamName,
        player_name: playerName,
        category,
        reason,
      });
    }
  }

  const counts = players.reduce((acc, row) => {
    acc[row.category] = Number(acc[row.category] || 0) + 1;
    return acc;
  }, {});

  return {
    generated_at: new Date().toISOString(),
    total: players.length,
    counts,
    needs_review_count: Number(counts.needs_review || 0),
    players,
  };
}

function loadTeamRoster(team) {
  const p = path.join(ROOT, team.rosterPath);
  const doc = readJson(p);
  const rows = Array.isArray(doc.roster) ? doc.roster : [];
  const byEntityId = new Map();
  const byWrId = new Map();
  const byName = new Map();
  for (const row of rows) {
    const entityId = String(row && row.entity_id ? row.entity_id : "").trim();
    const wrId = Number(row && row.wr_id ? row.wr_id : 0);
    const name = String(row && row.name ? row.name : "").trim();
    if (entityId && !byEntityId.has(entityId)) byEntityId.set(entityId, row);
    if (Number.isFinite(wrId) && wrId > 0 && !byWrId.has(wrId)) byWrId.set(wrId, row);
    if (name && !byName.has(name)) byName.set(name, row);
  }
  return { byEntityId, byWrId, byName };
}

function recoverTeamAnomalies(team, report, from, to, concurrency) {
  const results = Array.isArray(report.results) ? report.results : [];
  const rosterByName = loadTeamRoster(team);
  const targetRows = results.filter((row) => !row.excluded && getRowPeriodTotal(row) === 0);
  if (!targetRows.length) {
    return {
      attempted: 0,
      recovered: [],
      unrecovered: [],
    };
  }

  const recovered = [];
  const unrecovered = [];
  for (const row of targetRows) {
    const playerName = String(row.player || "");
    const entityId = String(row.entity_id || "").trim();
    const wrId = Number(row.wr_id || 0);
    const rosterPlayer =
      (entityId && rosterByName.byEntityId.get(entityId)) ||
      (Number.isFinite(wrId) && wrId > 0 ? rosterByName.byWrId.get(wrId) : null) ||
      rosterByName.byName.get(playerName);
    if (!rosterPlayer) {
      unrecovered.push({ player: playerName, reason: "missing_roster_player" });
      continue;
    }
    const profileUrl = defaultProfileUrlForPlayer(rosterPlayer);

    try {
      const raw = runNode(REPORT_SCRIPT, [
        "--json-only",
        "--include-matches",
        "--no-cache",
        "--univ",
        team.univ,
        "--player",
        playerName,
        "--profile-url",
        profileUrl,
        "--wr-id",
        String(rosterPlayer.wr_id),
        "--gender",
        String(rosterPlayer.gender || ""),
        "--tier",
        String(rosterPlayer.tier || ""),
        "--concurrency",
        concurrency,
      ], {
        label: `recover_report:${team.code}:${playerName}`,
        timeoutMs: 300000,
      });
      const parsed = JSON.parse(raw);
      writeJson(String(row.json_path), parsed);

      const csvOut = runNode(CSV_SCRIPT, [
        "--report-path",
        String(row.json_path),
        "--player",
        playerName,
        "--stable-name",
        "--from",
        from,
        "--to",
        to,
      ], {
        label: `recover_csv:${team.code}:${playerName}`,
        timeoutMs: 120000,
      }).trim();

      row.fetch_status = "ok";
      row.csv_status = "ok";
      row.csv_path = csvOut;
      row.error = null;

      const total = getRowPeriodTotal(row);
      if (total > 0) {
        recovered.push(playerName);
      } else {
        unrecovered.push({ player: playerName, reason: "still_zero_after_recovery" });
      }
    } catch (err) {
      row.error = err instanceof Error ? err.message : String(err);
      row.fetch_status = "failed";
      unrecovered.push({ player: playerName, reason: "recovery_exception" });
    }
  }

  return {
    attempted: targetRows.length,
    recovered,
    unrecovered,
  };
}

function buildAlerts(
  rowsWithDelta,
  cfg,
  rosterSyncReport = null,
  rosterTransitionSummary = [],
  homepageIntegrityReport = null,
  referenceTimeMs = Date.now()
) {
  const rules = cfg.rules || {};
  const allowlist =
    rules && rules.zero_record_players_allowlist && typeof rules.zero_record_players_allowlist === "object"
      ? rules.zero_record_players_allowlist
      : {};
  const zeroRecordTeamAllowlist = new Set(
    Array.isArray(rules && rules.zero_record_players_team_allowlist)
      ? rules.zero_record_players_team_allowlist.map((v) => String(v))
      : []
  );
  const movedInByTeam = movedInPlayersByTeam(rosterSyncReport);
  const rosterSizeChangedAllowlist = new Set(
    Array.isArray(rules && rules.roster_size_changed_team_allowlist)
      ? rules.roster_size_changed_team_allowlist.map((v) => String(v))
      : []
  );
  const rosterTransitionByTeam = new Map(
    (Array.isArray(rosterTransitionSummary) ? rosterTransitionSummary : [])
      .filter((row) => row && row.changed)
      .map((row) => [String(row.team_code || ""), row])
  );

  const alerts = [];
  for (const row of rowsWithDelta) {
    const rosterTransition = rosterTransitionByTeam.get(String(row.team_code || "")) || null;
    if (row.fetch_fail > 0 || row.csv_fail > 0) {
      alerts.push({
        severity: rules.pipeline_failure_severity || "critical",
        team: row.team,
        team_code: row.team_code,
        rule: "pipeline_failure",
        message: `fetch_fail=${row.fetch_fail}, csv_fail=${row.csv_fail}`,
      });
    }
    const zeroPlayers = splitZeroPlayers(row.zero_players);
    const allowSet = new Set(
      Array.isArray(allowlist[row.team_code]) ? allowlist[row.team_code].map((v) => String(v)) : []
    );
    const movedInSet = movedInByTeam.get(String(row.team_code || "")) || new Set();
    const actionableZeroPlayers = zeroPlayers.filter((name) => !allowSet.has(name) && !movedInSet.has(name));
    if (
      actionableZeroPlayers.length > 0 &&
      !rosterTransition &&
      !zeroRecordTeamAllowlist.has(String(row.team_code || ""))
    ) {
      alerts.push({
        severity: rules.zero_record_players_severity || "high",
        team: row.team,
        team_code: row.team_code,
        rule: "zero_record_players",
        message: `zero_record_players=${actionableZeroPlayers.length} (${actionableZeroPlayers.join(", ") || "-"})`,
      });
    }
    const rosterChanged = typeof row.delta_players === "number" && row.delta_players !== 0;
    if (typeof row.delta_total_matches === "number") {
      if (row.delta_total_matches < 0 && !rosterChanged && !rosterTransition) {
        alerts.push({
          severity: rules.negative_delta_matches_severity || "critical",
          team: row.team,
          team_code: row.team_code,
          rule: "total_matches_decreased",
          message: `delta_total_matches=${row.delta_total_matches}`,
        });
      } else if (row.delta_total_matches === 0 && rules.no_new_matches_enabled) {
        alerts.push({
          severity: rules.no_new_matches_severity || "low",
          team: row.team,
          team_code: row.team_code,
          rule: "no_new_matches",
          message: "delta_total_matches=0",
        });
      }
    }
    if (
      typeof row.delta_players === "number" &&
      row.delta_players !== 0 &&
      rosterTransition &&
      !rosterSizeChangedAllowlist.has(String(row.team_code || ""))
    ) {
      alerts.push({
        severity: rules.roster_size_changed_severity || "medium",
        team: row.team,
        team_code: row.team_code,
        rule: "roster_size_changed",
        message: `delta_players=${row.delta_players}`,
      });
    }
    if (rosterTransition && !rosterSizeChangedAllowlist.has(String(row.team_code || ""))) {
      alerts.push({
        severity: "medium",
        team: row.team,
        team_code: row.team_code,
        rule: "roster_transition_detected",
        message: `baseline=${rosterTransition.baseline_players}, current=${rosterTransition.current_players}, added=${rosterTransition.added_entity_ids.length}, removed=${rosterTransition.removed_entity_ids.length}`,
      });
    }
  }
  alerts.push(...buildHomepageIntegrityOperationalAlerts(homepageIntegrityReport, cfg, referenceTimeMs));
  alerts.push(...buildClusteredUncertainAffiliationAlerts(rosterSyncReport, cfg));
  return normalizeOpsAlertTeams(sortedAlerts(alerts));
}

async function main() {
  const from = argValue("--from", "2025-01-01");
  const to = argValue("--to", today());
  const concurrency = String(argValue("--concurrency", "1"));
  const dateTag = argValue("--date-tag", today());
  const strict = !hasFlag("--no-strict");
  const organize = !hasFlag("--no-organize");
  const rosterSync = !hasFlag("--no-roster-sync");
  const displayAliasApply = !hasFlag("--no-display-alias");
  const teamTableEnabled = !hasFlag("--no-team-table");
  const faRecordMetadataEnabled = !hasFlag("--no-fa-record-metadata");
  const useExistingJson = !hasFlag("--no-use-existing-json");
  const inactiveSkipDays = Number(argValue("--inactive-skip-days", "14")) || 0;
  const teamsArg = argValue("--teams", "");
  const teamSet = new Set(
    teamsArg
      .split(",")
      .map((v) => v.trim().toLowerCase())
      .filter(Boolean)
  );
  try {
    const discovery = await ensureAutoDiscoveredTeamProjects();
    if (discovery.created_projects_count > 0) {
      console.log(
        `[DISCOVERY] auto-created team projects: ${discovery.created_projects
          .map((item) => `${item.team_code}:${item.team_name}`)
          .join(", ")}`
      );
    }
  } catch (error) {
    console.error(`[WARN] team auto discovery failed: ${error instanceof Error ? error.message : String(error)}`);
  }
  const teamConfig = loadTeamConfig();
  const teams = teamSet.size ? teamConfig.filter((t) => teamSet.has(t.code)) : teamConfig;
  if (!teams.length) {
    const available = teamConfig.map((t) => t.code).join(",");
    throw new Error(`No teams selected. Use --teams ${available || "<none>"}`);
  }

  ensureDir(TMP_DIR);
  ensureDir(REPORTS_DIR);
  ACTIVE_PROGRESS_LOG_PATH = path.join(REPORTS_DIR, `daily_pipeline_progress_${dateTag}.jsonl`);
  fs.writeFileSync(ACTIVE_PROGRESS_LOG_PATH, "", "utf8");
  appendProgress("pipeline_start", {
    date_tag: dateTag,
    from,
    to,
    strict,
    teams: teams.map((team) => team.code),
  });

  const startedAt = new Date().toISOString();
  const rosterSyncReport = rosterSync ? runRosterSync(teams, teamConfig.length) : { ok: false, skipped: true };
  if (rosterSync && !rosterSyncReport.ok) {
    console.error(`[WARN] roster sync failed: ${rosterSyncReport.error}`);
  }
  const aliasApplyReport = displayAliasApply
    ? applyDisplayAliasesForTeams(teams)
    : { ok: false, skipped: true, teams: [] };
  if (displayAliasApply && !aliasApplyReport.ok) {
    const failed = aliasApplyReport.teams.filter((t) => !t.ok).map((t) => t.team_code).join(",");
    console.error(`[WARN] display alias apply failed for: ${failed}`);
  }

  const perTeamReports = [];
  for (const team of teams) {
    const reportFile = path.join(TMP_DIR, `${team.code}_roster_batch_export_report.json`);
    const teamConcurrency = exportConcurrencyForTeam(team.code, concurrency);
    const args = [
      EXPORT_SCRIPT,
      "--roster-path",
      team.rosterPath,
      "--univ",
      team.univ,
      "--concurrency",
      teamConcurrency,
      "--from",
      from,
      "--to",
      to,
      "--report-path",
      reportFile,
    ];
    if (useExistingJson) args.push("--use-existing-json");
    if (inactiveSkipDays > 0) {
      args.push("--inactive-skip-days", String(inactiveSkipDays));
    }
    console.log(`[RUN] ${team.code} ${team.univ}`);
    appendProgress("team_start", { team_code: team.code, team: team.univ, report_path: path.relative(ROOT, reportFile).replace(/\\/g, "/") });
    runNode(args[0], args.slice(1), {
      label: `export_roster:${team.code}`,
      timeoutMs: exportTimeoutForTeam(team.code),
    });
    const report = readJson(reportFile);
    appendProgress("team_done", {
      team_code: team.code,
      team: team.univ,
      results: Array.isArray(report.results) ? report.results.length : 0,
    });
    perTeamReports.push({ team, reportFile, report });
  }

  const summaryRows = perTeamReports.map(({ team, report }) => summarizeTeamFromReport(team, report));
  const faRecordMetadata = faRecordMetadataEnabled
    ? ensureFaRecordMetadata(teams)
    : { ok: false, skipped: true };
  if (faRecordMetadataEnabled && !faRecordMetadata.ok) {
    console.error(`[WARN] FA record metadata prepare failed: ${faRecordMetadata.error}`);
  }
  const teamTableReport = teamTableEnabled
    ? generateTeamTableReports(teams)
    : { ok: false, skipped: true, out_dir: path.relative(ROOT, TEAM_TABLE_OUT_DIR).replace(/\\/g, "/") };
  const priorPath = latestPreviousSnapshotPath(to, REPORTS_DIR);
  const prior = priorPath ? readJson(priorPath) : null;
  const comparablePrior = isComparablePriorSnapshot(prior, from, to);
  const priorMap = new Map(
    Array.isArray(prior && prior.teams) ? prior.teams.map((r) => [String(r.team_code), r]) : []
  );

  let rowsWithDelta = withDeltaRows(summaryRows, priorMap, comparablePrior);

  const recoveryActions = [];
  for (const item of perTeamReports) {
    const row = rowsWithDelta.find((r) => r.team_code === item.team.code);
    if (!row) continue;
    const needsRecovery =
      row.zero_record_players > 0 ||
      (typeof row.delta_total_matches === "number" && row.delta_total_matches < 0);
    if (!needsRecovery) continue;

    const rec = recoverTeamAnomalies(item.team, item.report, from, to, concurrency);
    if (rec.attempted > 0) {
      recoveryActions.push({
        team: item.team.univ,
        team_code: item.team.code,
        ...rec,
      });
      writeJson(item.reportFile, item.report);
    }
  }

  if (recoveryActions.length > 0) {
    const refreshedSummaryRows = perTeamReports.map(({ team, report }) =>
      summarizeTeamFromReport(team, report)
    );
    rowsWithDelta = withDeltaRows(refreshedSummaryRows, priorMap, comparablePrior);
  }

  const snapshot = {
    generated_at: new Date().toISOString(),
    started_at: startedAt,
    period_from: from,
    period_to: to,
    strict,
    roster_sync: rosterSyncReport,
    display_alias_apply: aliasApplyReport,
    fa_record_metadata: faRecordMetadata,
    teams: rowsWithDelta.map((r) => ({
      team: r.team,
      team_code: r.team_code,
      players: r.players,
      excluded_players: r.excluded_players,
      excluded_player_names: r.excluded_player_names,
      fetched_players: r.fetched_players,
      reused_players: r.reused_players,
      fetch_fail: r.fetch_fail,
      csv_fail: r.csv_fail,
      total_matches: r.total_matches,
      total_wins: r.total_wins,
      total_losses: r.total_losses,
      zero_record_players: r.zero_record_players,
      zero_players: r.zero_players,
      delta_total_matches: r.delta_total_matches,
      delta_total_wins: r.delta_total_wins,
      delta_total_losses: r.delta_total_losses,
      delta_players: r.delta_players,
    })),
    failed_players: rowsWithDelta.flatMap((r) =>
      r.failures.map((f) => ({ team: r.team, team_code: r.team_code, ...f }))
    ),
    recovery_actions: recoveryActions,
    team_table_report: teamTableReport,
    roster_transition_summary: summarizeRosterTransitions(teamConfig, readJsonIfExists(MANUAL_REFRESH_BASELINE_PATH, null)),
    delta_reference: {
      comparable: comparablePrior,
      prior_period_from: prior ? String(prior.period_from || "") : null,
      prior_period_to: prior ? String(prior.period_to || "") : null,
      current_period_from: from,
      current_period_to: to,
    },
    previous_snapshot: priorPath ? path.relative(ROOT, priorPath).replace(/\\/g, "/") : null,
    progress_log: path.relative(ROOT, ACTIVE_PROGRESS_LOG_PATH).replace(/\\/g, "/"),
  };

  const alertConfig = readAlertConfig();
  const homepageIntegrityReport = readJsonIfExists(HOMEPAGE_INTEGRITY_REPORT_PATH, null);
  snapshot.homepage_integrity = homepageIntegrityReport
    ? {
        generated_at: String(homepageIntegrityReport.generated_at || "").trim() || null,
        stale_snapshot_disagreement_count: Number(
          homepageIntegrityReport.summary &&
            homepageIntegrityReport.summary.live &&
            homepageIntegrityReport.summary.live.stale_snapshot_disagreement_count
            ? homepageIntegrityReport.summary.live.stale_snapshot_disagreement_count
            : 0
        ),
        snapshot_is_fresh: Boolean(
          homepageIntegrityReport.summary &&
            homepageIntegrityReport.summary.live &&
            homepageIntegrityReport.summary.live.snapshot_is_fresh
        ),
        report_path: path.relative(ROOT, HOMEPAGE_INTEGRITY_REPORT_PATH).replace(/\\/g, "/"),
      }
    : {
        generated_at: null,
        stale_snapshot_disagreement_count: 0,
        snapshot_is_fresh: null,
        report_path: null,
      };
  const alerts = buildAlerts(
    rowsWithDelta,
    alertConfig,
    rosterSyncReport,
    snapshot.roster_transition_summary,
    homepageIntegrityReport,
    Date.now()
  );
  const zeroRecordReview = classifyZeroRecordPlayers(rowsWithDelta, alertConfig);
  const alertSummary = {
    generated_at: new Date().toISOString(),
    date_tag: dateTag,
    strict,
    blocking_severities: alertConfig.blocking_severities,
    applied_rules: alertConfig.rules,
    counts: {
      critical: alerts.filter((a) => a.severity === "critical").length,
      high: alerts.filter((a) => a.severity === "high").length,
      medium: alerts.filter((a) => a.severity === "medium").length,
      low: alerts.filter((a) => a.severity === "low").length,
      total: alerts.length,
    },
    alerts,
  };

  const outJson = path.join(REPORTS_DIR, `daily_pipeline_snapshot_${dateTag}.json`);
  const outCsv = path.join(REPORTS_DIR, `daily_pipeline_snapshot_${dateTag}.csv`);
  const outAlertJson = path.join(REPORTS_DIR, `daily_pipeline_alerts_${dateTag}.json`);
  const outAlertCsv = path.join(REPORTS_DIR, `daily_pipeline_alerts_${dateTag}.csv`);
  const latestSnapshotJson = path.join(REPORTS_DIR, "daily_pipeline_snapshot_latest.json");
  const latestAlertsJson = path.join(REPORTS_DIR, "daily_pipeline_alerts_latest.json");
  const zeroRecordReviewPath = path.join(REPORTS_DIR, `zero_record_review_${dateTag}.json`);
  const zeroRecordReviewLatestPath = path.join(REPORTS_DIR, "zero_record_review_latest.json");
  const shouldWriteLatestAliases = !isChunkedDateTag(dateTag);
  snapshot.zero_record_review = {
    total: zeroRecordReview.total,
    counts: zeroRecordReview.counts,
    needs_review_count: zeroRecordReview.needs_review_count,
    report_path: path.relative(ROOT, zeroRecordReviewPath).replace(/\\/g, "/"),
  };
  writeJson(outJson, snapshot);
  if (shouldWriteLatestAliases) {
    writeJson(latestSnapshotJson, snapshot);
  }
  writeCsv(
    outCsv,
    snapshot.teams.map((r) => ({
      team: r.team,
      team_code: r.team_code,
      players: r.players,
      excluded_players: r.excluded_players ?? 0,
      fetched_players: r.fetched_players ?? 0,
      reused_players: r.reused_players ?? 0,
      fetch_fail: r.fetch_fail,
      csv_fail: r.csv_fail,
      total_matches: r.total_matches,
      total_wins: r.total_wins,
      total_losses: r.total_losses,
      zero_record_players: r.zero_record_players,
      zero_players: r.zero_players,
      delta_total_matches: r.delta_total_matches ?? "",
      delta_total_wins: r.delta_total_wins ?? "",
      delta_total_losses: r.delta_total_losses ?? "",
      delta_players: r.delta_players ?? "",
    }))
  );
  writeJson(outAlertJson, alertSummary);
  if (shouldWriteLatestAliases) {
    writeJson(latestAlertsJson, alertSummary);
  }
  writeCsv(
    outAlertCsv,
    alerts.map((a) => ({
      severity: a.severity,
      team: a.team,
      team_code: a.team_code,
      rule: a.rule,
      message: a.message,
    }))
  );
  writeJson(zeroRecordReviewPath, zeroRecordReview);
  if (shouldWriteLatestAliases) {
    writeJson(zeroRecordReviewLatestPath, zeroRecordReview);
  }

  if (organize) {
    runNode(ORGANIZE_SCRIPT, [], {
      label: "organize_generated_artifacts",
      timeoutMs: 120000,
    });
  }

  console.log(`[DONE] ${path.relative(ROOT, outJson)}`);
  console.log(`[DONE] ${path.relative(ROOT, outCsv)}`);
  console.log(`[DONE] ${path.relative(ROOT, outAlertJson)}`);
  console.log(`[DONE] ${path.relative(ROOT, outAlertCsv)}`);
  console.log(`[DONE] ${path.relative(ROOT, zeroRecordReviewPath)}`);
  console.log(`[DONE] ${path.relative(ROOT, zeroRecordReviewLatestPath)}`);
  if (teamTableReport.ok) {
    console.log(`[DONE] ${teamTableReport.out_dir}`);
  } else if (!teamTableReport.skipped) {
    console.error(`[WARN] team table report failed: ${teamTableReport.error}`);
  }

  if (strict) {
    const blocking = new Set(
      Array.isArray(alertConfig.blocking_severities) && alertConfig.blocking_severities.length
        ? alertConfig.blocking_severities
        : ["critical", "high"]
    );
    const hasBlockingAlert = alerts.some((a) => blocking.has(a.severity));
    if (hasBlockingAlert) {
      appendProgress("pipeline_fail", { reason: "blocking_alert", alert_counts: alertSummary.counts });
      process.exitCode = 1;
      console.error("[STRICT] Daily pipeline alerts include blocking severity.");
    }
  }
  if (!process.exitCode) {
    appendProgress("pipeline_done", { alert_counts: alertSummary.counts });
  }
}

if (require.main === module) {
  main().catch((error) => {
    console.error(error instanceof Error ? error.stack || error.message : String(error));
    process.exit(1);
  });
}

module.exports = {
  buildAlerts,
  buildClusteredUncertainAffiliationAlerts,
  buildHomepageIntegrityOperationalAlerts,
  classifyZeroRecordPlayers,
  movedInPlayersByTeam,
  exportConcurrencyForTeam,
  exportTimeoutForTeam,
};
