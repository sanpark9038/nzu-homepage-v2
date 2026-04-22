const fs = require("fs");
const path = require("path");
const { createClient } = require("@supabase/supabase-js");
require("dotenv").config({ path: path.join(__dirname, "..", "..", ".env.local"), quiet: true });

const ROOT = path.resolve(__dirname, "..", "..");
const PROJECTS_DIR = path.join(ROOT, "data", "metadata", "projects");
const DISPLAY_ALIASES_PATH = path.join(ROOT, "data", "metadata", "player_display_aliases.v1.json");
const PLAYER_METADATA_PATH = path.join(ROOT, "scripts", "player_metadata.json");
const REVIEW_DECISIONS_PATH = path.join(ROOT, "data", "metadata", "soop_manual_review_decisions.v1.json");
const SNAPSHOT_PATH = path.join(ROOT, "data", "metadata", "soop_live_snapshot.generated.v1.json");
const OUTPUT_PATH = path.join(ROOT, "tmp", "reports", "homepage_integrity_report.json");
const SNAPSHOT_FRESH_MS = 15 * 60 * 1000;

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || "";
const supabaseServiceRoleKey =
  process.env.SUPABASE_SERVICE_ROLE_KEY ||
  process.env.SUPABASE_SERVICE_KEY ||
  "";
let cachedSupabase = null;

function readJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, "utf8").replace(/^\uFEFF/, ""));
}

function writeJson(filePath, value) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, JSON.stringify(value, null, 2), "utf8");
}

function formatError(error) {
  if (error instanceof Error) {
    return error.stack || error.message;
  }
  if (error && typeof error === "object") {
    try {
      return JSON.stringify(error, null, 2);
    } catch {}
  }
  return String(error);
}

function trim(value) {
  return String(value || "").trim();
}

function lower(value) {
  return trim(value).toLowerCase();
}

function createSupabaseAdminClient() {
  if (!supabaseUrl || !supabaseServiceRoleKey) {
    throw new Error(
      "Homepage integrity report requires NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY (or SUPABASE_SERVICE_KEY)."
    );
  }
  if (!cachedSupabase) {
    cachedSupabase = createClient(supabaseUrl, supabaseServiceRoleKey);
  }
  return cachedSupabase;
}

function loadDisplayAliases() {
  if (!fs.existsSync(DISPLAY_ALIASES_PATH)) return { teams: {} };
  return readJson(DISPLAY_ALIASES_PATH);
}

function loadProjectRosters() {
  const rows = [];
  if (!fs.existsSync(PROJECTS_DIR)) return rows;
  const dirs = fs
    .readdirSync(PROJECTS_DIR, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => entry.name);

  for (const project of dirs) {
    const filePath = path.join(PROJECTS_DIR, project, `players.${project}.v1.json`);
    if (!fs.existsSync(filePath)) continue;
    const doc = readJson(filePath);
    const roster = Array.isArray(doc && doc.roster) ? doc.roster : [];
    for (const row of roster) {
      rows.push({
        project,
        file_path: filePath,
        entity_id: trim(row && row.entity_id) || null,
        wr_id: Number.isFinite(Number(row && row.wr_id)) ? Number(row.wr_id) : null,
        gender: lower(row && row.gender) || null,
        name: trim(row && row.name) || null,
        display_name: trim(row && row.display_name) || null,
      });
    }
  }
  return rows;
}

function loadPlayerMetadata() {
  if (!fs.existsSync(PLAYER_METADATA_PATH)) return [];
  const rows = readJson(PLAYER_METADATA_PATH);
  if (!Array.isArray(rows)) return [];
  return rows.map((row) => ({
    wr_id: Number.isFinite(Number(row && row.wr_id)) ? Number(row.wr_id) : null,
    name: trim(row && row.name) || null,
    gender: lower(row && row.gender) || null,
    soop_user_id: trim(row && row.soop_user_id) || null,
  }));
}

function loadReviewDecisions() {
  if (!fs.existsSync(REVIEW_DECISIONS_PATH)) return [];
  const doc = readJson(REVIEW_DECISIONS_PATH);
  const rows = Array.isArray(doc && doc.decisions) ? doc.decisions : [];
  return rows.map((row) => ({
    source_name: trim(row && row.source_name) || null,
    canonical_name: trim(row && row.canonical_name) || null,
    decision: lower(row && row.decision) || null,
    elo_requirement: lower(row && row.elo_requirement) || null,
    soop_user_id: trim(row && row.soop_user_id) || null,
  }));
}

function loadSnapshotStatus() {
  if (!fs.existsSync(SNAPSHOT_PATH)) {
    return {
      exists: false,
      updated_at: null,
      is_fresh: false,
      live_count: 0,
      channels: {},
    };
  }

  const doc = readJson(SNAPSHOT_PATH);
  const updatedAt = trim(doc && doc.updated_at) || null;
  const updatedTime = updatedAt ? new Date(updatedAt) : null;
  const isFresh =
    updatedTime instanceof Date &&
    !Number.isNaN(updatedTime.getTime()) &&
    Date.now() - updatedTime.getTime() >= 0 &&
    Date.now() - updatedTime.getTime() <= SNAPSHOT_FRESH_MS;
  const channels = doc && typeof doc.channels === "object" ? doc.channels : {};
  const liveCount = Object.values(channels).filter((row) => row && row.isLive === true).length;
  return {
    exists: true,
    updated_at: updatedAt,
    is_fresh: Boolean(isFresh),
    live_count: liveCount,
    channels,
  };
}

async function fetchPlayersServing() {
  const supabase = createSupabaseAdminClient();
  const { data, error } = await supabase
    .from("players")
    .select("name,nickname,eloboard_id,gender,soop_id,broadcast_url,channel_profile_image_url,is_live,match_history,total_wins,total_losses");
  if (error) throw error;
  return Array.isArray(data) ? data : [];
}

async function fetchHeroMediaServing() {
  const supabase = createSupabaseAdminClient();
  const { data, error } = await supabase
    .from("hero_media")
    .select("id,url,type,is_active,created_at")
    .order("is_active", { ascending: false })
    .order("created_at", { ascending: false });

  if (error) {
    if (error.code === "PGRST205") {
      return [];
    }
    throw error;
  }
  return Array.isArray(data) ? data : [];
}

function buildAliasSection(rosters, aliasDoc) {
  const teams = aliasDoc && typeof aliasDoc.teams === "object" ? aliasDoc.teams : {};
  const globalRows = Array.isArray(aliasDoc && aliasDoc.global) ? aliasDoc.global : [];
  const rosterByProjectAndName = new Map(
    rosters.filter((row) => row.project && row.name).map((row) => [`${row.project}:${row.name}`, row])
  );
  const rostersByName = new Map();
  for (const row of rosters) {
    const name = trim(row && row.name);
    if (!name) continue;
    const bucket = rostersByName.get(name) || [];
    bucket.push(row);
    rostersByName.set(name, bucket);
  }

  const expected = [];
  const mismatches = [];

  for (const row of globalRows) {
    const canonicalName = trim(row && row.name);
    const displayName = trim(row && row.display_name);
    if (!canonicalName || !displayName) continue;
    const matches = rostersByName.get(canonicalName) || [];
    if (!matches.length) continue;
    for (const roster of matches) {
      const payload = {
        project: roster.project,
        canonical_name: canonicalName,
        expected_display_name: displayName,
        roster_display_name: roster ? roster.display_name : null,
        entity_id: roster ? roster.entity_id : null,
      };
      expected.push(payload);
      if (trim(roster.display_name) !== displayName) {
        mismatches.push(payload);
      }
    }
  }

  for (const [project, rows] of Object.entries(teams)) {
    for (const row of Array.isArray(rows) ? rows : []) {
      const canonicalName = trim(row && row.name);
      const displayName = trim(row && row.display_name);
      if (!canonicalName || !displayName) continue;
      const roster = rosterByProjectAndName.get(`${project}:${canonicalName}`) || null;
      const payload = {
        project,
        canonical_name: canonicalName,
        expected_display_name: displayName,
        roster_display_name: roster ? roster.display_name : null,
        entity_id: roster ? roster.entity_id : null,
      };
      if (expected.some((item) => item.project === payload.project && item.canonical_name === payload.canonical_name)) {
        continue;
      }
      expected.push(payload);
      if (!roster || trim(roster.display_name) !== displayName) {
        mismatches.push(payload);
      }
    }
  }

  return {
    total_expected_aliases: expected.length,
    applied: expected.length - mismatches.length,
    missing_or_mismatched: mismatches.length,
    mismatches: mismatches.sort((a, b) =>
      `${a.project}:${a.canonical_name}`.localeCompare(`${b.project}:${b.canonical_name}`, "ko")
    ),
  };
}

function buildSoopSection(players, metadataRows, reviewDecisions) {
  const byWrGender = new Map();
  const byNameGender = new Map();
  const decisionsByName = new Map();

  for (const row of metadataRows) {
    const wrId = Number(row && row.wr_id);
    const gender = lower(row && row.gender);
    const name = trim(row && row.name);
    if (Number.isFinite(wrId) && gender) {
      byWrGender.set(`${wrId}:${gender}`, row);
    }
    if (name && gender) {
      byNameGender.set(`${name}:${gender}`, row);
    }
  }

  for (const row of reviewDecisions) {
    const names = [trim(row && row.source_name), trim(row && row.canonical_name)].filter(Boolean);
    for (const name of names) {
      decisionsByName.set(name, row);
    }
  }

  const missingInPlayers = [];
  const metadataBackedButPlayersMissing = [];
  const missingActionable = [];
  const missingExcluded = [];
  const missingPendingRegistration = [];
  const missingUnreviewed = [];

  for (const player of players) {
    const entityId = trim(player && player.eloboard_id);
    const wrMatch = entityId.match(/(\d+)$/);
    const wrId = wrMatch ? Number(wrMatch[1]) : null;
    const gender = lower(player && player.gender);
    const name = trim(player && player.name);
    const soopId = trim(player && player.soop_id) || null;
    const metadata =
      (Number.isFinite(wrId) && gender ? byWrGender.get(`${wrId}:${gender}`) : null) ||
      (name && gender ? byNameGender.get(`${name}:${gender}`) : null) ||
      null;
    const decision = name ? decisionsByName.get(name) || null : null;

    if (!soopId) {
      const payload = {
        name,
        gender: gender || null,
        eloboard_id: entityId || null,
        metadata_soop_user_id: metadata ? metadata.soop_user_id : null,
        review_decision: decision ? decision.decision : null,
        review_elo_requirement: decision ? decision.elo_requirement : null,
        review_soop_user_id: decision ? decision.soop_user_id : null,
      };
      missingInPlayers.push(payload);
      if (decision && decision.decision === "exclude") {
        missingExcluded.push(payload);
      } else if (decision && decision.elo_requirement === "pending_registration") {
        missingPendingRegistration.push(payload);
      } else if (decision && decision.decision === "include") {
        missingActionable.push(payload);
      } else {
        missingUnreviewed.push(payload);
      }
      if (metadata && metadata.soop_user_id) {
        metadataBackedButPlayersMissing.push({
          name,
          gender: gender || null,
          eloboard_id: entityId || null,
          metadata_soop_user_id: metadata.soop_user_id,
        });
      }
    }
  }

  return {
    players_total: players.length,
    players_with_soop: players.filter((row) => trim(row && row.soop_id)).length,
    players_missing_soop: missingInPlayers.length,
    players_missing_soop_actionable: missingActionable.length,
    players_missing_soop_excluded: missingExcluded.length,
    players_missing_soop_pending_registration: missingPendingRegistration.length,
    players_missing_soop_unreviewed: missingUnreviewed.length,
    metadata_rows_with_soop: metadataRows.filter((row) => trim(row && row.soop_user_id)).length,
    metadata_backed_but_players_missing: metadataBackedButPlayersMissing.length,
    metadata_backed_but_players_missing_rows: metadataBackedButPlayersMissing.sort((a, b) =>
      String(a.name).localeCompare(String(b.name), "ko")
    ),
    sample_missing_players: missingInPlayers
      .sort((a, b) => String(a.name).localeCompare(String(b.name), "ko"))
      .slice(0, 30),
    actionable_missing_players: missingActionable
      .sort((a, b) => String(a.name).localeCompare(String(b.name), "ko"))
      .slice(0, 30),
    excluded_missing_players: missingExcluded
      .sort((a, b) => String(a.name).localeCompare(String(b.name), "ko"))
      .slice(0, 30),
    pending_registration_missing_players: missingPendingRegistration
      .sort((a, b) => String(a.name).localeCompare(String(b.name), "ko"))
      .slice(0, 30),
    unreviewed_missing_players: missingUnreviewed
      .sort((a, b) => String(a.name).localeCompare(String(b.name), "ko"))
      .slice(0, 30),
  };
}

function buildLiveSection(players, snapshot) {
  const livePlayers = players.filter((row) => row && row.is_live === true);
  const effectiveLiveRows = [];
  if (snapshot.exists && snapshot.is_fresh) {
    for (const player of players) {
      const soopId = trim(player && player.soop_id);
      if (!soopId) continue;
      const channel = snapshot.channels[soopId];
      if (channel && channel.isLive === true) {
        effectiveLiveRows.push({
          name: trim(player && player.name) || null,
          soop_id: soopId,
        });
      }
    }
  }
  const staleSnapshotDisagreements = [];

  if (snapshot.exists) {
    for (const player of livePlayers) {
      const soopId = trim(player && player.soop_id);
      if (!soopId) continue;
      const channel = snapshot.channels[soopId];
      if (!channel) continue;
      if (snapshot.is_fresh) continue;
      if (channel.isLive === false) {
        staleSnapshotDisagreements.push({
          name: trim(player && player.name) || null,
          soop_id: soopId,
          snapshot_updated_at: snapshot.updated_at,
        });
      }
    }
  }

  return {
    db_live_count: livePlayers.length,
    effective_live_count: snapshot.exists && snapshot.is_fresh ? effectiveLiveRows.length : livePlayers.length,
    snapshot_exists: snapshot.exists,
    snapshot_updated_at: snapshot.updated_at,
    snapshot_is_fresh: snapshot.is_fresh,
    snapshot_live_count: snapshot.live_count,
    stale_snapshot_override_risk: snapshot.is_fresh ? 0 : 0,
    stale_snapshot_disagreement_count: staleSnapshotDisagreements.length,
    stale_snapshot_disagreement_rows: staleSnapshotDisagreements.sort((a, b) =>
      String(a.name).localeCompare(String(b.name), "ko")
    ),
  };
}

function buildHeroMediaSection(rows) {
  const activeRows = rows.filter((row) => row && row.is_active === true);
  const supportedTypes = new Set(["image", "video"]);
  const activeRow = activeRows[0] || null;
  const issueRows = [];

  for (const row of rows) {
    const type = lower(row && row.type);
    const url = trim(row && row.url);
    const isActive = row && row.is_active === true;
    const issues = [];
    if (!url) issues.push("missing_url");
    if (url && !url.includes("/storage/v1/object/public/hero-media/")) issues.push("unexpected_public_url");
    if (!supportedTypes.has(type)) issues.push("invalid_type");
    if (issues.length) {
      issueRows.push({
        id: trim(row && row.id) || null,
        is_active: isActive,
        type: trim(row && row.type) || null,
        url,
        issues,
      });
    }
  }

  const activeIssues = [];
  if (!activeRows.length) activeIssues.push("missing_active");
  if (activeRows.length > 1) activeIssues.push("multiple_active");
  if (activeRow) {
    const activeType = lower(activeRow.type);
    const activeUrl = trim(activeRow.url);
    if (!activeUrl) activeIssues.push("active_missing_url");
    if (activeUrl && !activeUrl.includes("/storage/v1/object/public/hero-media/")) {
      activeIssues.push("active_unexpected_public_url");
    }
    if (!supportedTypes.has(activeType)) activeIssues.push("active_invalid_type");
  }

  return {
    total_rows: rows.length,
    active_count: activeRows.length,
    active_ok: activeIssues.length === 0,
    active_issues: activeIssues,
    invalid_rows_count: issueRows.length,
    invalid_rows: issueRows,
    active_row: activeRow
      ? {
          id: trim(activeRow.id) || null,
          type: trim(activeRow.type) || null,
          url: trim(activeRow.url) || null,
          created_at: trim(activeRow.created_at) || null,
        }
      : null,
  };
}

function buildMatchHistorySection(players) {
  const rows = Array.isArray(players) ? players : [];
  const withHistory = rows.filter((row) => Array.isArray(row && row.match_history) && row.match_history.length > 0);
  const degraded = [];
  let totalRows = 0;
  let opponentFilled = 0;

  for (const player of withHistory) {
    const history = Array.isArray(player.match_history) ? player.match_history : [];
    const filled = history.filter((item) => trim(item && item.opponent_name)).length;
    totalRows += history.length;
    opponentFilled += filled;
    if (history.length > 0 && filled < history.length) {
      degraded.push({
        name: trim(player && player.name) || null,
        eloboard_id: trim(player && player.eloboard_id) || null,
        total_rows: history.length,
        opponent_name_filled: filled,
        opponent_name_fill_rate: Number((filled / history.length).toFixed(4)),
        total_wins: Number(player && player.total_wins ? player.total_wins : 0),
        total_losses: Number(player && player.total_losses ? player.total_losses : 0),
      });
    }
  }

  return {
    players_total: rows.length,
    players_with_history: withHistory.length,
    total_match_history_rows: totalRows,
    opponent_name_filled_rows: opponentFilled,
    opponent_name_fill_rate: totalRows ? Number((opponentFilled / totalRows).toFixed(4)) : 0,
    players_with_blank_opponent_rows: degraded.length,
    degraded_players: degraded
      .sort((a, b) => {
        if (a.opponent_name_fill_rate !== b.opponent_name_fill_rate) {
          return a.opponent_name_fill_rate - b.opponent_name_fill_rate;
        }
        return String(a.name || "").localeCompare(String(b.name || ""), "ko");
      })
      .slice(0, 30),
  };
}

async function main() {
  const aliasDoc = loadDisplayAliases();
  const rosters = loadProjectRosters();
  const metadataRows = loadPlayerMetadata();
  const reviewDecisions = loadReviewDecisions();
  const snapshot = loadSnapshotStatus();
  const players = await fetchPlayersServing();
  const heroMediaRows = await fetchHeroMediaServing();

  const report = {
    schema_version: "1.0.0",
    generated_at: new Date().toISOString(),
    summary: {
      aliases: buildAliasSection(rosters, aliasDoc),
      soop: buildSoopSection(players, metadataRows, reviewDecisions),
      live: buildLiveSection(players, snapshot),
      hero_media: buildHeroMediaSection(heroMediaRows),
      match_history: buildMatchHistorySection(players),
    },
  };

  writeJson(OUTPUT_PATH, report);

  console.log("Generated homepage integrity report.");
  console.log(`- output: ${OUTPUT_PATH}`);
  console.log(`- alias_missing_or_mismatched: ${report.summary.aliases.missing_or_mismatched}`);
  console.log(`- players_missing_soop: ${report.summary.soop.players_missing_soop}`);
  console.log(`- players_missing_soop_actionable: ${report.summary.soop.players_missing_soop_actionable}`);
  console.log(`- players_missing_soop_excluded: ${report.summary.soop.players_missing_soop_excluded}`);
  console.log(
    `- players_missing_soop_pending_registration: ${report.summary.soop.players_missing_soop_pending_registration}`
  );
  console.log(`- players_missing_soop_unreviewed: ${report.summary.soop.players_missing_soop_unreviewed}`);
  console.log(
    `- metadata_backed_but_players_missing: ${report.summary.soop.metadata_backed_but_players_missing}`
  );
  console.log(`- db_live_count: ${report.summary.live.db_live_count}`);
  console.log(`- effective_live_count: ${report.summary.live.effective_live_count}`);
  console.log(`- snapshot_is_fresh: ${report.summary.live.snapshot_is_fresh}`);
  console.log(`- stale_snapshot_override_risk: ${report.summary.live.stale_snapshot_override_risk}`);
  console.log(`- stale_snapshot_disagreement_count: ${report.summary.live.stale_snapshot_disagreement_count}`);
  console.log(`- hero_media_total_rows: ${report.summary.hero_media.total_rows}`);
  console.log(`- hero_media_active_count: ${report.summary.hero_media.active_count}`);
  console.log(`- hero_media_active_ok: ${report.summary.hero_media.active_ok}`);
  console.log(`- hero_media_invalid_rows_count: ${report.summary.hero_media.invalid_rows_count}`);
  console.log(`- match_history_players_with_history: ${report.summary.match_history.players_with_history}`);
  console.log(`- match_history_total_rows: ${report.summary.match_history.total_match_history_rows}`);
  console.log(`- match_history_opponent_name_fill_rate: ${report.summary.match_history.opponent_name_fill_rate}`);
  console.log(`- match_history_players_with_blank_opponent_rows: ${report.summary.match_history.players_with_blank_opponent_rows}`);
}

main().catch((error) => {
  console.error(formatError(error));
  process.exit(1);
});
