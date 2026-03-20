const fs = require("fs");
const path = require("path");
const { execFileSync } = require("child_process");

const ROOT = path.resolve(__dirname, "..", "..");
const TMP_DIR = path.join(ROOT, "tmp");
const REPORTS_DIR = path.join(TMP_DIR, "reports");
const EXPORT_SCRIPT = path.join(ROOT, "scripts", "tools", "export-nzu-roster-detailed.js");
const ORGANIZE_SCRIPT = path.join(ROOT, "scripts", "tools", "organize-generated-artifacts.js");

const TEAM_CONFIG = [
  { code: "nzu", univ: "늪지대", rosterPath: "data/metadata/projects/nzu/players.nzu.v1.json" },
  { code: "wfu", univ: "와플대", rosterPath: "data/metadata/projects/wfu/players.wfu.v1.json" },
  { code: "ssu", univ: "수술대", rosterPath: "data/metadata/projects/ssu/players.ssu.v1.json" },
  { code: "jsa", univ: "JSA", rosterPath: "data/metadata/projects/jsa/players.jsa.v1.json" },
  { code: "black", univ: "흑카데미", rosterPath: "data/metadata/projects/black/players.black.v1.json" },
];

function argValue(flag, fallback = null) {
  const idx = process.argv.indexOf(flag);
  if (idx >= 0 && process.argv[idx + 1]) return process.argv[idx + 1];
  return fallback;
}

function hasFlag(flag) {
  return process.argv.includes(flag);
}

function today() {
  return new Date().toISOString().slice(0, 10);
}

function ensureDir(p) {
  fs.mkdirSync(p, { recursive: true });
}

function readJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, "utf8").replace(/^\uFEFF/, ""));
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
  return execFileSync("node", [scriptPath, ...args], {
    cwd: ROOT,
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
  });
}

function latestPreviousSnapshotPath(dateStr) {
  if (!fs.existsSync(REPORTS_DIR)) return null;
  const files = fs
    .readdirSync(REPORTS_DIR)
    .filter((n) => /^daily_pipeline_snapshot_\d{4}-\d{2}-\d{2}\.json$/.test(n))
    .filter((n) => !n.includes(dateStr))
    .sort();
  if (!files.length) return null;
  return path.join(REPORTS_DIR, files[files.length - 1]);
}

function summarizeTeamFromReport(team, report) {
  const results = Array.isArray(report.results) ? report.results : [];
  let totalMatches = 0;
  let totalWins = 0;
  let totalLosses = 0;
  const zeroPlayers = [];
  const failures = [];

  for (const row of results) {
    const fetchFail = row.fetch_status !== "ok" && row.fetch_status !== "used_existing_json";
    const csvFail = row.csv_status !== "ok";
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
    players: results.length,
    fetch_fail: failures.filter((f) => f.fetch_status !== "ok" && f.fetch_status !== "used_existing_json").length,
    csv_fail: failures.filter((f) => f.csv_status !== "ok").length,
    total_matches: totalMatches,
    total_wins: totalWins,
    total_losses: totalLosses,
    zero_record_players: zeroPlayers.length,
    zero_players: zeroPlayers.join(", "),
    failures,
  };
}

function buildAlerts(rowsWithDelta) {
  const alerts = [];
  for (const row of rowsWithDelta) {
    if (row.fetch_fail > 0 || row.csv_fail > 0) {
      alerts.push({
        severity: "critical",
        team: row.team,
        team_code: row.team_code,
        rule: "pipeline_failure",
        message: `fetch_fail=${row.fetch_fail}, csv_fail=${row.csv_fail}`,
      });
    }
    if (row.zero_record_players > 0) {
      alerts.push({
        severity: "high",
        team: row.team,
        team_code: row.team_code,
        rule: "zero_record_players",
        message: `zero_record_players=${row.zero_record_players} (${row.zero_players || "-"})`,
      });
    }
    if (typeof row.delta_total_matches === "number") {
      if (row.delta_total_matches < 0) {
        alerts.push({
          severity: "critical",
          team: row.team,
          team_code: row.team_code,
          rule: "total_matches_decreased",
          message: `delta_total_matches=${row.delta_total_matches}`,
        });
      } else if (row.delta_total_matches === 0) {
        alerts.push({
          severity: "low",
          team: row.team,
          team_code: row.team_code,
          rule: "no_new_matches",
          message: "delta_total_matches=0",
        });
      }
    }
    if (typeof row.delta_players === "number" && row.delta_players !== 0) {
      alerts.push({
        severity: "medium",
        team: row.team,
        team_code: row.team_code,
        rule: "roster_size_changed",
        message: `delta_players=${row.delta_players}`,
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
  const teamsArg = argValue("--teams", "");
  const teamSet = new Set(
    teamsArg
      .split(",")
      .map((v) => v.trim().toLowerCase())
      .filter(Boolean)
  );
  const teams = teamSet.size ? TEAM_CONFIG.filter((t) => teamSet.has(t.code)) : TEAM_CONFIG;
  if (!teams.length) {
    throw new Error("No teams selected. Use --teams nzu,wfu,ssu,jsa,black");
  }

  ensureDir(TMP_DIR);
  ensureDir(REPORTS_DIR);

  const startedAt = new Date().toISOString();
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
    console.log(`[RUN] ${team.code} ${team.univ}`);
    runNode(args[0], args.slice(1));
    const report = readJson(reportFile);
    perTeamReports.push({ team, reportFile, report });
  }

  const summaryRows = perTeamReports.map(({ team, report }) => summarizeTeamFromReport(team, report));
  const priorPath = latestPreviousSnapshotPath(dateTag);
  const prior = priorPath ? readJson(priorPath) : null;
  const priorMap = new Map(
    Array.isArray(prior && prior.teams) ? prior.teams.map((r) => [String(r.team_code), r]) : []
  );

  const rowsWithDelta = summaryRows.map((row) => {
    const prev = priorMap.get(row.team_code);
    return {
      ...row,
      delta_total_matches: prev ? row.total_matches - Number(prev.total_matches || 0) : null,
      delta_total_wins: prev ? row.total_wins - Number(prev.total_wins || 0) : null,
      delta_total_losses: prev ? row.total_losses - Number(prev.total_losses || 0) : null,
      delta_players: prev ? row.players - Number(prev.players || 0) : null,
    };
  });

  const snapshot = {
    generated_at: new Date().toISOString(),
    started_at: startedAt,
    period_from: from,
    period_to: to,
    strict,
    teams: rowsWithDelta.map((r) => ({
      team: r.team,
      team_code: r.team_code,
      players: r.players,
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
    previous_snapshot: priorPath ? path.relative(ROOT, priorPath).replace(/\\/g, "/") : null,
  };

  const alerts = buildAlerts(rowsWithDelta);
  const alertSummary = {
    generated_at: new Date().toISOString(),
    date_tag: dateTag,
    strict,
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

  if (strict) {
    const hasBlockingAlert = alerts.some((a) => a.severity === "critical" || a.severity === "high");
    if (hasBlockingAlert) {
      process.exitCode = 1;
      console.error("[STRICT] Daily pipeline alerts include high/critical severity.");
    }
  }
}

main();
