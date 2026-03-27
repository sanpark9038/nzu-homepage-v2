const fs = require("fs");
const path = require("path");

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
        tier: String(player && player.tier ? player.tier : ""),
        last_changed_at: player && player.last_changed_at ? player.last_changed_at : null,
      });
    }
  }
  return players;
}

function compareRosterJoinersRemovals(beforePlayers, afterPlayers) {
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

function buildDiscordSummaryCheck({ reportsDir, baselinePath, projectsDir, snapshot, alertsDoc }) {
  const beforePlayers = loadBaselinePlayers(baselinePath);
  const afterPlayers = loadCurrentRosterState(projectsDir);
  const rosterChanges = compareRosterJoinersRemovals(beforePlayers, afterPlayers);
  const rosterSyncJoiners = loadRosterSyncJoiners(reportsDir);

  return {
    joiners: rosterSyncJoiners.length ? rosterSyncJoiners : rosterChanges.joiners,
    joiners_source: rosterSyncJoiners.length ? "team_roster_sync_report" : "baseline_vs_current_roster",
    removals: rosterChanges.removals,
    new_matches_total: sumNewMatches(snapshot),
    top_team_deltas: topTeamDeltas(snapshot),
    alerts: summarizeAlerts(alertsDoc),
  };
}

module.exports = {
  buildDiscordSummaryCheck,
  buildPlayerKey,
  loadBaselinePlayers,
  loadCurrentRosterState,
  normalizeTeamName,
  readJsonIfExists,
};
