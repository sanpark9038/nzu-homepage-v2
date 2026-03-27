const fs = require("fs");
const path = require("path");

const ROOT = path.resolve(__dirname, "..", "..");
const DEFAULT_REPORTS_DIR = path.join(ROOT, "tmp", "reports");
const DEFAULT_BASELINE_PATH = path.join(DEFAULT_REPORTS_DIR, "manual_refresh_baseline.json");
const DEFAULT_PROJECTS_DIR = path.join(ROOT, "data", "metadata", "projects");

function argValue(flag, fallback = null) {
  const idx = process.argv.indexOf(flag);
  if (idx >= 0 && process.argv[idx + 1]) return process.argv[idx + 1];
  return fallback;
}

function hasFlag(flag) {
  return process.argv.includes(flag);
}

function resolveReportsDir() {
  const input = String(argValue("--reports-dir", DEFAULT_REPORTS_DIR) || "").trim();
  return path.resolve(input);
}

function resolveFilePath(value, fallback) {
  const text = String(value || "").trim();
  if (!text) return fallback;
  return path.resolve(text);
}

function latestFileByPrefix(reportsDir, prefix) {
  if (!fs.existsSync(reportsDir)) return null;
  const files = fs
    .readdirSync(reportsDir)
    .filter((n) => n.startsWith(prefix) && n.endsWith(".json"))
    .map((name) => {
      const full = path.join(reportsDir, name);
      return { full, mtime: fs.statSync(full).mtimeMs };
    })
    .sort((a, b) => b.mtime - a.mtime);
  return files.length ? files[0].full : null;
}

function readJsonIfExists(filePath) {
  if (!filePath || !fs.existsSync(filePath)) return null;
  return JSON.parse(fs.readFileSync(filePath, "utf8").replace(/^\uFEFF/, ""));
}

function normalizeTeamName(value) {
  const raw = String(value || "").trim();
  if (raw.toLowerCase() === "fa") return "무소속";
  return raw || "무소속";
}

function buildPlayerKey(player) {
  const entityId = String(player && player.entity_id ? player.entity_id : "").trim();
  if (entityId) return `entity:${entityId}`;
  return `name:${String(player && player.name ? player.name : "").trim().toLowerCase()}`;
}

function toPlayerMap(players) {
  return new Map(players.map((player) => [buildPlayerKey(player), player]));
}

function loadBaselinePlayers(baselinePath) {
  const baseline = readJsonIfExists(baselinePath);
  const teams = Array.isArray(baseline && baseline.teams) ? baseline.teams : [];
  return teams.flatMap((team) => (Array.isArray(team.players) ? team.players : []));
}

function loadCurrentRosterState(projectsDir) {
  if (!fs.existsSync(projectsDir)) return [];
  const teamDirs = fs
    .readdirSync(projectsDir, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => entry.name)
    .sort((a, b) => String(a).localeCompare(String(b)));

  const players = [];
  for (const code of teamDirs) {
    const filePath = path.join(projectsDir, code, `players.${code}.v1.json`);
    if (!fs.existsSync(filePath)) continue;
    const doc = readJsonIfExists(filePath);
    const roster = Array.isArray(doc && doc.roster) ? doc.roster : [];
    for (const player of roster) {
      players.push({
        entity_id: String(player && player.entity_id ? player.entity_id : ""),
        name: String(player && player.name ? player.name : ""),
        display_name: String(
          player && (player.display_name || player.name) ? player.display_name || player.name : ""
        ),
        team_code: String(player && player.team_code ? player.team_code : doc.team_code || code),
        team_name: normalizeTeamName(player && player.team_name ? player.team_name : doc.team_name || code),
      });
    }
  }
  return players;
}

function comparePlayerChanges(beforePlayers, afterPlayers) {
  const beforeMap = toPlayerMap(beforePlayers);
  const afterMap = toPlayerMap(afterPlayers);
  const joiners = [];
  const removals = [];

  for (const [key, current] of afterMap.entries()) {
    if (beforeMap.has(key)) continue;
    joiners.push({
      player_name: current.display_name || current.name,
      team_name: normalizeTeamName(current.team_name),
    });
  }

  for (const [key, prev] of beforeMap.entries()) {
    if (afterMap.has(key)) continue;
    removals.push({
      player_name: prev.display_name || prev.name,
      team_name: normalizeTeamName(prev.team_name),
    });
  }

  joiners.sort((a, b) => String(a.player_name).localeCompare(String(b.player_name), "ko"));
  removals.sort((a, b) => String(a.player_name).localeCompare(String(b.player_name), "ko"));
  return { joiners, removals };
}

function sumNewMatches(snapshot) {
  const teams = Array.isArray(snapshot && snapshot.teams) ? snapshot.teams : [];
  return teams.reduce((acc, row) => {
    const value = Number(row && row.delta_total_matches);
    if (!Number.isFinite(value) || value <= 0) return acc;
    return acc + value;
  }, 0);
}

function topTeamDeltas(snapshot, limit = 5) {
  const teams = Array.isArray(snapshot && snapshot.teams) ? snapshot.teams : [];
  return teams
    .map((row) => ({
      team_code: String(row && row.team_code ? row.team_code : ""),
      team: String(row && row.team ? row.team : row && row.team_code ? row.team_code : ""),
      delta_total_matches: Number(row && row.delta_total_matches),
      players: Number(row && row.players ? row.players : 0) || 0,
      fetched_players: Number(row && row.fetched_players ? row.fetched_players : 0) || 0,
      reused_players: Number(row && row.reused_players ? row.reused_players : 0) || 0,
    }))
    .filter((row) => Number.isFinite(row.delta_total_matches) && row.delta_total_matches > 0)
    .sort((a, b) => b.delta_total_matches - a.delta_total_matches)
    .slice(0, limit);
}

function summarizeAlerts(alertsDoc) {
  const counts =
    alertsDoc && alertsDoc.counts && typeof alertsDoc.counts === "object"
      ? alertsDoc.counts
      : { critical: 0, high: 0, medium: 0, low: 0, total: 0 };
  const alerts = Array.isArray(alertsDoc && alertsDoc.alerts) ? alertsDoc.alerts : [];
  return {
    counts,
    alerts: alerts.map((row) => ({
      severity: row.severity,
      team_code: row.team_code,
      team: row.team,
      rule: row.rule,
      message: row.message,
    })),
  };
}

function loadRosterSyncJoiners(reportsDir) {
  const syncReport = readJsonIfExists(path.join(reportsDir, "team_roster_sync_report.json"));
  const added = Array.isArray(syncReport && syncReport.added) ? syncReport.added : [];
  return added
    .map((row) => ({
      player_name: String(row && row.name ? row.name : "").trim(),
      team_name: normalizeTeamName(row && row.to ? row.to : "무소속"),
    }))
    .filter((row) => row.player_name);
}

function relativePath(filePath) {
  return path.relative(ROOT, filePath).replace(/\\/g, "/");
}

function toMarkdown(summary) {
  const lines = [
    "## Discord Summary Check",
    "",
    `- Snapshot: \`${summary.snapshot}\``,
    `- Alerts: \`${summary.alerts}\``,
    `- Period: ${summary.period_from || "-"} ~ ${summary.period_to || "-"}`,
    `- Previous Snapshot: ${summary.previous_snapshot || "-"}`,
    `- Comparable: ${summary.delta_reference && summary.delta_reference.comparable ? "yes" : "no"}`,
    `- New Matches Total: ${summary.discord_summary_check.new_matches_total}`,
  ];

  const joiners = Array.isArray(summary.discord_summary_check.joiners)
    ? summary.discord_summary_check.joiners
    : [];
  const alerts = summary.discord_summary_check.alerts || { counts: {}, alerts: [] };
  const topTeamDeltas = Array.isArray(summary.discord_summary_check.top_team_deltas)
    ? summary.discord_summary_check.top_team_deltas
    : [];

  lines.push(
    `- Alerts Count: critical ${alerts.counts.critical || 0}, high ${alerts.counts.high || 0}, medium ${alerts.counts.medium || 0}, low ${alerts.counts.low || 0}`
  );

  if (joiners.length) {
    lines.push("");
    lines.push("### Joiners");
    for (const row of joiners) {
      lines.push(`- ${row.player_name} (${row.team_name})`);
    }
  }

  if (topTeamDeltas.length) {
    lines.push("");
    lines.push("### Top Team Match Deltas");
    for (const row of topTeamDeltas) {
      lines.push(`- ${row.team} (${row.team_code}): +${row.delta_total_matches} matches`);
    }
  }

  if (Array.isArray(alerts.alerts) && alerts.alerts.length) {
    lines.push("");
    lines.push("### Alerts");
    for (const row of alerts.alerts) {
      lines.push(`- [${row.severity}] ${row.team} (${row.team_code}) ${row.rule}: ${row.message}`);
    }
  }

  return lines.join("\n");
}

function main() {
  const reportsDir = resolveReportsDir();
  const baselinePath = resolveFilePath(argValue("--baseline", ""), path.join(reportsDir, "manual_refresh_baseline.json"));
  const projectsDir = resolveFilePath(argValue("--projects-dir", ""), DEFAULT_PROJECTS_DIR);

  const snapshotPath = resolveFilePath(
    argValue("--snapshot", ""),
    latestFileByPrefix(reportsDir, "daily_pipeline_snapshot_")
  );
  const alertsPath = resolveFilePath(
    argValue("--alerts", ""),
    latestFileByPrefix(reportsDir, "daily_pipeline_alerts_")
  );

  if (!snapshotPath || !alertsPath) {
    console.error("Missing snapshot or alerts file.");
    process.exit(1);
  }

  const snapshot = readJsonIfExists(snapshotPath);
  const alertsDoc = readJsonIfExists(alertsPath);
  if (!snapshot || !alertsDoc) {
    console.error("Unable to read snapshot or alerts JSON.");
    process.exit(1);
  }

  const beforePlayers = loadBaselinePlayers(baselinePath);
  const afterPlayers = loadCurrentRosterState(projectsDir);
  const roster = comparePlayerChanges(beforePlayers, afterPlayers);
  const rosterSyncJoiners = loadRosterSyncJoiners(reportsDir);
  const newMatches = sumNewMatches(snapshot);
  const teamDeltas = topTeamDeltas(snapshot);
  const alertSummary = summarizeAlerts(alertsDoc);
  const deltaReference =
    snapshot && snapshot.delta_reference && typeof snapshot.delta_reference === "object"
      ? snapshot.delta_reference
      : null;

  const output = {
    snapshot: relativePath(snapshotPath),
    alerts: relativePath(alertsPath),
    baseline: fs.existsSync(baselinePath) ? relativePath(baselinePath) : null,
    generated_at: snapshot.generated_at || null,
    period_from: snapshot.period_from || null,
    period_to: snapshot.period_to || null,
    previous_snapshot: snapshot.previous_snapshot || null,
    delta_reference: deltaReference,
    discord_summary_check: {
      joiners: rosterSyncJoiners.length ? rosterSyncJoiners : roster.joiners,
      joiners_source: rosterSyncJoiners.length ? "team_roster_sync_report" : "baseline_vs_current_roster",
      removals: roster.removals,
      new_matches_total: newMatches,
      top_team_deltas: teamDeltas,
      alerts: alertSummary,
    },
  };

  if (hasFlag("--markdown")) {
    console.log(toMarkdown(output));
    return;
  }

  console.log(JSON.stringify(output, null, 2));
}

main();
