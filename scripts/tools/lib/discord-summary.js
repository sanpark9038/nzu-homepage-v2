const fs = require("fs");
const path = require("path");

const ROOT = path.resolve(__dirname, "..", "..", "..");
const MANUAL_OVERRIDES_PATH = path.join(ROOT, "data", "metadata", "roster_manual_overrides.v1.json");
const CURRENT_ROSTER_STATE_FILE = "current_roster_state.json";
const PLAYER_METADATA_PATH = path.join(ROOT, "scripts", "player_metadata.json");

function readJsonIfExists(filePath) {
  if (!filePath || !fs.existsSync(filePath)) return null;
  return JSON.parse(fs.readFileSync(filePath, "utf8").replace(/^\uFEFF/, ""));
}

function buildTrackedEntityIdSet() {
  const rows = readJsonIfExists(PLAYER_METADATA_PATH);
  if (!Array.isArray(rows)) return new Set();
  const tracked = new Set();
  for (const row of rows) {
    const wrId = Number(row && row.wr_id ? row.wr_id : 0);
    const gender = String(row && row.gender ? row.gender : "").trim().toLowerCase();
    if (!Number.isFinite(wrId) || wrId <= 0 || !gender) continue;
    tracked.add(`eloboard:${gender}:${wrId}`);
  }
  return tracked;
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

function buildNameTeamKey(player) {
  const name = String(
    player && (player.display_name || player.name) ? player.display_name || player.name : ""
  )
    .trim()
    .toLowerCase();
  const teamName = normalizeTeamName(player && player.team_name ? player.team_name : "")
    .trim()
    .toLowerCase();
  if (!name || !teamName) return "";
  return `${name}@@${teamName}`;
}

function matchesTeam(player, teamValue) {
  const expected = String(teamValue || "").trim();
  if (!player || !expected) return false;
  const expectedLower = expected.toLowerCase();
  const teamCode = String(player.team_code || "").trim().toLowerCase();
  if (teamCode && teamCode === expectedLower) return true;
  const teamName = normalizeTeamName(player.team_name).trim().toLowerCase();
  const expectedTeamName = normalizeTeamName(expected).trim().toLowerCase();
  return Boolean(teamName && expectedTeamName && teamName === expectedTeamName);
}

function isRosterSyncRowAlreadyPresent(row, previousPlayers, lookup, teamValue) {
  if (!Array.isArray(previousPlayers) || !previousPlayers.length || !row) return false;
  const previousByKey = toPlayerMap(previousPlayers, lookup);
  const playerKey = buildPlayerKey(
    {
      entity_id: String(row.entity_id || ""),
      name: String(row.player_name || row.name || ""),
    },
    lookup
  );
  const previous = playerKey ? previousByKey.get(playerKey) : null;
  if (previous && matchesTeam(previous, teamValue)) return true;

  const previousNameTeamKeys = new Set(previousPlayers.map((player) => buildNameTeamKey(player)).filter(Boolean));
  return previousNameTeamKeys.has(
    buildNameTeamKey({
      name: String(row.player_name || row.name || ""),
      display_name: String(row.player_name || row.name || ""),
      team_name: normalizeTeamName(teamValue),
    })
  );
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
  const beforeNameTeamKeys = new Set(beforePlayers.map((player) => buildNameTeamKey(player)).filter(Boolean));
  const afterNameTeamKeys = new Set(afterPlayers.map((player) => buildNameTeamKey(player)).filter(Boolean));
  const trackedEntityIds = buildTrackedEntityIdSet();
  const joiners = [];
  const removals = [];

  for (const [key, current] of afterMap.entries()) {
    if (beforeMap.has(key)) continue;
    if (beforeNameTeamKeys.has(buildNameTeamKey(current))) continue;
    joiners.push({
      player_name: current.display_name || current.name,
      team_name: normalizeTeamName(current.team_name),
    });
  }

  for (const [key, prev] of beforeMap.entries()) {
    if (afterMap.has(key)) continue;
    if (afterNameTeamKeys.has(buildNameTeamKey(prev))) continue;
    const entityId = canonicalEntityId(prev && prev.entity_id ? prev.entity_id : "", lookup);
    if (entityId && trackedEntityIds.has(entityId)) continue;
    removals.push({
      entity_id: entityId,
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

function loadRosterSyncJoiners(reportsDir, options = {}) {
  const syncReport = readJsonIfExists(path.join(reportsDir, "team_roster_sync_report.json"));
  const added = Array.isArray(syncReport && syncReport.added) ? syncReport.added : [];
  const previousPlayers = Array.isArray(options.previousPlayers) ? options.previousPlayers : [];
  const lookup = options.lookup instanceof Map ? options.lookup : legacyEntityIdLookup();
  return added
    .map((row) => ({
      entity_id: String(row && row.entity_id ? row.entity_id : "").trim(),
      player_name: String(row && row.name ? row.name : "").trim(),
      team_name: normalizeTeamName(row && row.to ? row.to : "무소속"),
    }))
    .filter((row) => row.player_name)
    .filter((row) => !isRosterSyncRowAlreadyPresent(row, previousPlayers, lookup, row.team_name));
}

function loadRosterSyncAffiliationChanges(reportsDir, options = {}) {
  const syncReport = readJsonIfExists(path.join(reportsDir, "team_roster_sync_report.json"));
  const moved = Array.isArray(syncReport && syncReport.moved) ? syncReport.moved : [];
  const previousPlayers = Array.isArray(options.previousPlayers) ? options.previousPlayers : [];
  const lookup = options.lookup instanceof Map ? options.lookup : legacyEntityIdLookup();
  return moved
    .map((row) => ({
      entity_id: String(row && row.entity_id ? row.entity_id : "").trim(),
      player_name: String(row && row.name ? row.name : "").trim(),
      old_team: normalizeTeamName(row && row.from ? row.from : "fa"),
      new_team: normalizeTeamName(row && row.to ? row.to : "fa"),
      change_confidence: String(row && row.change_confidence ? row.change_confidence : "inferred").trim() || "inferred",
    }))
    .filter((row) => row.player_name)
    .filter((row) => !isRosterSyncRowAlreadyPresent(row, previousPlayers, lookup, row.new_team));
}

function summarizeAffiliationChanges(affiliationChanges) {
  const rows = Array.isArray(affiliationChanges) ? affiliationChanges : [];
  const counts = {
    confirmed: 0,
    inferred: 0,
    fallback: 0,
    total: rows.length,
  };
  const byPreviousTeam = new Map();

  for (const row of rows) {
    const confidence = String(row && row.change_confidence ? row.change_confidence : "inferred").trim().toLowerCase();
    if (confidence === "confirmed" || confidence === "inferred" || confidence === "fallback") {
      counts[confidence] += 1;
    }
    const oldTeam = normalizeTeamName(row && row.old_team ? row.old_team : "");
    byPreviousTeam.set(oldTeam, Number(byPreviousTeam.get(oldTeam) || 0) + 1);
  }

  return {
    counts,
    by_previous_team: Array.from(byPreviousTeam.entries())
      .map(([team_name, count]) => ({ team_name, count }))
      .sort((a, b) => b.count - a.count || String(a.team_name).localeCompare(String(b.team_name), "ko")),
  };
}

function buildDiscordSummaryCheck({
  reportsDir,
  baselinePath,
  projectsDir,
  snapshot,
  alertsDoc,
  currentPlayers,
  previousRosterStatePlayers,
}) {
  const beforePlayers = loadBaselinePlayers(baselinePath);
  const snapshotPlayers = loadCurrentRosterStateSnapshot(reportsDir);
  const explicitCurrentPlayers = Array.isArray(currentPlayers) ? currentPlayers : [];
  const previousPlayers = Array.isArray(previousRosterStatePlayers) ? previousRosterStatePlayers : [];
  const afterPlayers = explicitCurrentPlayers.length
    ? explicitCurrentPlayers
    : snapshotPlayers.length
      ? snapshotPlayers
      : loadCurrentRosterState(projectsDir);
  const lookup = mergedEntityIdLookup({ reportsDir });
  const rosterChanges = compareRosterJoinersRemovals(beforePlayers, afterPlayers, lookup);
  const rosterSyncJoiners = loadRosterSyncJoiners(reportsDir, { previousPlayers, lookup });
  const affiliationChanges = loadRosterSyncAffiliationChanges(reportsDir, { previousPlayers, lookup });

  return {
    joiners: rosterSyncJoiners.length ? rosterSyncJoiners : rosterChanges.joiners,
    joiners_source: rosterSyncJoiners.length ? "team_roster_sync_report" : "baseline_vs_current_roster",
    roster_source: snapshotPlayers.length ? CURRENT_ROSTER_STATE_FILE : "projects_dir",
    removals: rosterChanges.removals,
    affiliation_changes: affiliationChanges,
    affiliation_change_summary: summarizeAffiliationChanges(affiliationChanges),
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
