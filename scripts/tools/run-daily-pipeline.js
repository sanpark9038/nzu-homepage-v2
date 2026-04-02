const fs = require("fs");
const path = require("path");
const { execFileSync } = require("child_process");
const { defaultProfileUrlForPlayer } = require("./lib/eloboard-special-cases");
const {
  isComparablePriorSnapshot,
  latestPreviousSnapshotPath,
  parseDateTag,
} = require("./lib/daily-pipeline-snapshot");

const ROOT = path.resolve(__dirname, "..", "..");
const TMP_DIR = path.join(ROOT, "tmp");
const REPORTS_DIR = path.join(TMP_DIR, "reports");
const NODE_BIN = process.execPath || "node";
const ALERT_RULES_PATH = path.join(ROOT, "data", "metadata", "pipeline_alert_rules.v1.json");
const EXPORT_SCRIPT = path.join(ROOT, "scripts", "tools", "export-nzu-roster-detailed.js");
const REPORT_SCRIPT = path.join(ROOT, "scripts", "tools", "report-nzu-2025-records.js");
const CSV_SCRIPT = path.join(ROOT, "scripts", "tools", "export-player-matches-csv.js");
const EXPORT_METADATA_SCRIPT = path.join(ROOT, "scripts", "tools", "export-nzu-roster-metadata.js");
const ORGANIZE_SCRIPT = path.join(ROOT, "scripts", "tools", "organize-generated-artifacts.js");
const TEAM_TABLE_SCRIPT = path.join(ROOT, "scripts", "tools", "report-team-roster-table.js");
const ROSTER_SYNC_SCRIPT = path.join(ROOT, "scripts", "tools", "sync-team-roster-metadata.js");
const DISPLAY_ALIAS_SCRIPT = path.join(ROOT, "scripts", "tools", "apply-player-display-aliases.js");
const TEAM_TABLE_OUT_DIR = path.join(TMP_DIR, "reports", "team-roster-table");
const NODE_BIN_FALLBACK = "node";
const MANUAL_REFRESH_BASELINE_PATH = path.join(REPORTS_DIR, "manual_refresh_baseline.json");

function argValue(flag, fallback = null) {
  const idx = process.argv.indexOf(flag);
  if (idx >= 0 && process.argv[idx + 1]) return process.argv[idx + 1];
  return fallback;
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
      negative_delta_matches_severity: "critical",
      roster_size_changed_severity: "medium",
      roster_size_changed_team_allowlist: [],
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

function runNode(scriptPath, args) {
  try {
    return execFileSync(NODE_BIN, [scriptPath, ...args], {
      cwd: ROOT,
      encoding: "utf8",
      stdio: ["ignore", "pipe", "pipe"],
      maxBuffer: 50 * 1024 * 1024,
    });
  } catch (error) {
    const code = error && typeof error === "object" ? String(error.code || "") : "";
    if (code !== "EPERM" || NODE_BIN === NODE_BIN_FALLBACK) throw error;
    return execFileSync(NODE_BIN_FALLBACK, [scriptPath, ...args], {
      cwd: ROOT,
      encoding: "utf8",
      stdio: ["ignore", "pipe", "pipe"],
      maxBuffer: 50 * 1024 * 1024,
    });
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
    const raw = runNode(TEAM_TABLE_SCRIPT, ["--teams", teamCodes, "--out-dir", TEAM_TABLE_OUT_DIR]).trim();
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
    const raw = runNode(ROSTER_SYNC_SCRIPT, args).trim();
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
    runNode(EXPORT_METADATA_SCRIPT, ["--univ", faTeam.univ]);
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
      const raw = runNode(DISPLAY_ALIAS_SCRIPT, ["--project", team.code]).trim();
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
      ]);
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
      ]).trim();

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

function buildAlerts(rowsWithDelta, cfg, rosterSyncReport = null, rosterTransitionSummary = []) {
  const rules = cfg.rules || {};
  const allowlist =
    rules && rules.zero_record_players_allowlist && typeof rules.zero_record_players_allowlist === "object"
      ? rules.zero_record_players_allowlist
      : {};
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

  function splitZeroPlayers(raw) {
    return String(raw || "")
      .split(",")
      .map((v) => v.trim())
      .filter(Boolean);
  }

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
    if (actionableZeroPlayers.length > 0 && !rosterTransition) {
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
  return sortedAlerts(alerts);
}

function main() {
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
  const teamConfig = loadTeamConfig();
  const teams = teamSet.size ? teamConfig.filter((t) => teamSet.has(t.code)) : teamConfig;
  if (!teams.length) {
    const available = teamConfig.map((t) => t.code).join(",");
    throw new Error(`No teams selected. Use --teams ${available || "<none>"}`);
  }

  ensureDir(TMP_DIR);
  ensureDir(REPORTS_DIR);

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
    const args = [
      EXPORT_SCRIPT,
      "--roster-path",
      team.rosterPath,
      "--univ",
      team.univ,
      "--concurrency",
      concurrency,
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
    runNode(args[0], args.slice(1));
    const report = readJson(reportFile);
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
  };

  const alertConfig = readAlertConfig();
  const alerts = buildAlerts(rowsWithDelta, alertConfig, rosterSyncReport, snapshot.roster_transition_summary);
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
  writeJson(outJson, snapshot);
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

  if (organize) {
    runNode(ORGANIZE_SCRIPT, []);
  }

  console.log(`[DONE] ${path.relative(ROOT, outJson)}`);
  console.log(`[DONE] ${path.relative(ROOT, outCsv)}`);
  console.log(`[DONE] ${path.relative(ROOT, outAlertJson)}`);
  console.log(`[DONE] ${path.relative(ROOT, outAlertCsv)}`);
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
      process.exitCode = 1;
      console.error("[STRICT] Daily pipeline alerts include blocking severity.");
    }
  }
}

if (require.main === module) {
  main();
}

module.exports = {
  buildAlerts,
  movedInPlayersByTeam,
};
