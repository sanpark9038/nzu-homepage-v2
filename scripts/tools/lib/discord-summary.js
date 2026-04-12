const fs = require("fs");
const path = require("path");

const ROOT = path.resolve(__dirname, "..", "..", "..");
const MANUAL_OVERRIDES_PATH = path.join(ROOT, "data", "metadata", "roster_manual_overrides.v1.json");
const CURRENT_ROSTER_STATE_FILE = "current_roster_state.json";

function readJsonIfExists(filePath) {
  if (!filePath || !fs.existsSync(filePath)) return null;
  return JSON.parse(fs.readFileSync(filePath, "utf8").replace(/^\uFEFF/, ""));
}

function isChunkedReportFile(name, prefix) {
  const suffix = String(name || "").slice(String(prefix || "").length);
  return /chunk\d+\.json$/i.test(suffix);
}

function resolveLatestReportFile(reportsDir, prefix) {
  if (!reportsDir || !fs.existsSync(reportsDir)) return null;

  const files = fs
    .readdirSync(reportsDir)
    .filter((name) => name.startsWith(prefix) && name.endsWith(".json"))
    .map((name) => {
      const full = path.join(reportsDir, name);
      return {
        full,
        name,
        isChunk: isChunkedReportFile(name, prefix),
        mtime: fs.statSync(full).mtimeMs,
      };
    });

  if (!files.length) return null;

  files.sort((a, b) => {
    if (a.isChunk !== b.isChunk) return a.isChunk ? 1 : -1;
    if (a.mtime !== b.mtime) return b.mtime - a.mtime;
    return String(b.name).localeCompare(String(a.name));
  });

  return files[0].full;
}

let cachedLegacyEntityIdLookup = null;

function buildLegacyEntityIdLookup(manualOverrides) {
  const lookup = new Map();
  for (const row of Array.isArray(manualOverrides) ? manualOverrides : []) {
    const successorEntityId = String(row && row.entity_id ? row.entity_id : "").trim();
    if (!successorEntityId) continue;
    lookup.set(successorEntityId, successorEntityId);
    const legacyEntityIds = Array.isArray(row && row.legacy_entity_ids)
      ? row.legacy_entity_ids.map((value) => String(value || "").trim()).filter(Boolean)
      : [];
    for (const legacyEntityId of legacyEntityIds) {
      lookup.set(legacyEntityId, successorEntityId);
    }
  }
  return lookup;
}

function legacyEntityIdLookup() {
  if (cachedLegacyEntityIdLookup) return cachedLegacyEntityIdLookup;
  const doc = readJsonIfExists(MANUAL_OVERRIDES_PATH);
  cachedLegacyEntityIdLookup = buildLegacyEntityIdLookup(doc && doc.overrides);
  return cachedLegacyEntityIdLookup;
}

function buildIdentityMigrationLookup(syncReport) {
  const lookup = new Map();
  const migrations = Array.isArray(syncReport && syncReport.identity_migrations) ? syncReport.identity_migrations : [];
  for (const row of migrations) {
    const previousEntityId = String(row && row.previous_entity_id ? row.previous_entity_id : "").trim();
    const observedEntityId = String(row && row.observed_entity_id ? row.observed_entity_id : "").trim();
    if (!previousEntityId || !observedEntityId) continue;
    lookup.set(observedEntityId, previousEntityId);
  }
  return lookup;
}

function mergedEntityIdLookup({ reportsDir } = {}) {
  const lookup = new Map(legacyEntityIdLookup());
  if (reportsDir) {
    const syncReport = readJsonIfExists(path.join(reportsDir, "team_roster_sync_report.json"));
    const migrationLookup = buildIdentityMigrationLookup(syncReport);
    for (const [fromId, toId] of migrationLookup.entries()) {
      lookup.set(fromId, lookup.get(toId) || toId);
    }
  }
  return lookup;
}

function canonicalEntityId(value, lookup = legacyEntityIdLookup()) {
  const entityId = String(value || "").trim();
  if (!entityId) return "";
  return lookup.get(entityId) || entityId;
}

function normalizeTeamName(value) {
  const raw = String(value || "").trim();
  if (raw.toLowerCase() === "fa") return "무소속";
  return raw || "무소속";
}

function buildPlayerKey(player, lookup = legacyEntityIdLookup()) {
  const entityId = canonicalEntityId(player && player.entity_id ? player.entity_id : "", lookup);
  if (entityId) return `entity:${entityId}`;
  return `name:${String(player && player.name ? player.name : "").trim().toLowerCase()}`;
}

function toPlayerMap(players, lookup = legacyEntityIdLookup()) {
  return new Map(players.map((player) => [buildPlayerKey(player, lookup), player]));
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
        wr_id: Number(player && player.wr_id ? player.wr_id : 0) || 0,
        gender: String(player && player.gender ? player.gender : ""),
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

function loadCurrentRosterStateSnapshot(reportsDir) {
  if (!reportsDir) return [];
  const doc = readJsonIfExists(path.join(reportsDir, CURRENT_ROSTER_STATE_FILE));
  const players = Array.isArray(doc && doc.players) ? doc.players : [];
  return players.map((player) => ({
    entity_id: String(player && player.entity_id ? player.entity_id : ""),
    wr_id: Number(player && player.wr_id ? player.wr_id : 0) || 0,
    gender: String(player && player.gender ? player.gender : ""),
    name: String(player && player.name ? player.name : ""),
    display_name: String(
      player && (player.display_name || player.name) ? player.display_name || player.name : ""
    ),
    team_code: String(player && player.team_code ? player.team_code : ""),
    team_name: normalizeTeamName(player && player.team_name ? player.team_name : ""),
    tier: String(player && player.tier ? player.tier : ""),
    last_changed_at: player && player.last_changed_at ? player.last_changed_at : null,
  }));
}

function writeCurrentRosterStateSnapshot(reportsDir, players) {
  if (!reportsDir) return null;
  const filePath = path.join(reportsDir, CURRENT_ROSTER_STATE_FILE);
  const payload = {
    generated_at: new Date().toISOString(),
    players: Array.isArray(players) ? players : [],
  };
  fs.mkdirSync(reportsDir, { recursive: true });
  fs.writeFileSync(filePath, JSON.stringify(payload, null, 2), "utf8");
  return filePath;
}

function compareRosterJoinersRemovals(beforePlayers, afterPlayers, lookup = legacyEntityIdLookup()) {
  const beforeMap = toPlayerMap(beforePlayers, lookup);
  const afterMap = toPlayerMap(afterPlayers, lookup);
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
  const snapshotPlayers = loadCurrentRosterStateSnapshot(reportsDir);
  const afterPlayers = snapshotPlayers.length ? snapshotPlayers : loadCurrentRosterState(projectsDir);
  const lookup = mergedEntityIdLookup({ reportsDir });
  const rosterChanges = compareRosterJoinersRemovals(beforePlayers, afterPlayers, lookup);
  const rosterSyncJoiners = loadRosterSyncJoiners(reportsDir);

  return {
    joiners: rosterSyncJoiners.length ? rosterSyncJoiners : rosterChanges.joiners,
    joiners_source: rosterSyncJoiners.length ? "team_roster_sync_report" : "baseline_vs_current_roster",
    roster_source: snapshotPlayers.length ? CURRENT_ROSTER_STATE_FILE : "projects_dir",
    removals: rosterChanges.removals,
    new_matches_total: sumNewMatches(snapshot),
    top_team_deltas: topTeamDeltas(snapshot),
    alerts: summarizeAlerts(alertsDoc),
  };
}

module.exports = {
  buildLegacyEntityIdLookup,
  buildIdentityMigrationLookup,
  buildDiscordSummaryCheck,
  buildPlayerKey,
  canonicalEntityId,
  compareRosterJoinersRemovals,
  loadBaselinePlayers,
  loadCurrentRosterState,
  loadCurrentRosterStateSnapshot,
  mergedEntityIdLookup,
  normalizeTeamName,
  readJsonIfExists,
  resolveLatestReportFile,
  writeCurrentRosterStateSnapshot,
};
