import fs from "node:fs";
import path from "node:path";
import type { Database } from "@/lib/database.types";

type PlayerRow = Database["public"]["Tables"]["players"]["Row"];
type Player = Pick<
  PlayerRow,
  | "id"
  | "name"
  | "race"
  | "tier"
  | "university"
  | "photo_url"
  | "broadcast_title"
  | "broadcast_url"
  | "channel_profile_image_url"
  | "created_at"
  | "detailed_stats"
  | "elo_point"
  | "eloboard_id"
  | "is_live"
  | "last_synced_at"
  | "live_thumbnail_url"
  | "nickname"
  | "soop_id"
  | "tier_rank"
  | "total_losses"
  | "total_wins"
  | "win_rate"
  | "gender"
  | "last_checked_at"
  | "last_match_at"
  | "last_changed_at"
  | "check_priority"
  | "check_interval_days"
> & {
  match_history?: PlayerRow["match_history"] | null;
};

type TournamentPlaceholderPlayerConfig = {
  name?: string;
  race?: string;
  tier?: string;
};

type TournamentTeamConfig = {
  team_code?: string;
  team_name?: string;
  player_ids?: string[];
  player_names?: string[];
  captain_player_id?: string;
  captain_player_name?: string;
  placeholder_players?: TournamentPlaceholderPlayerConfig[];
};

type TournamentHomeConfig = {
  schema_version?: string;
  updated_at?: string;
  description?: string;
  teams?: TournamentTeamConfig[];
};

export type TournamentHomeTeam = {
  teamCode: string;
  teamName: string;
  captainPlayerId: string | null;
  players: Array<Player & { isCaptain?: boolean }>;
};

const TOURNAMENT_TEAM_SIZE = 4;

const TOURNAMENT_HOME_CONFIG_PATH = path.join(
  process.cwd(),
  "data",
  "metadata",
  "tournament_home_teams.v1.json"
);

function readTournamentHomeConfig(): TournamentHomeConfig {
  if (!fs.existsSync(TOURNAMENT_HOME_CONFIG_PATH)) {
    return { teams: [] };
  }

  const raw = fs.readFileSync(TOURNAMENT_HOME_CONFIG_PATH, "utf8").replace(/^\uFEFF/, "");
  return JSON.parse(raw) as TournamentHomeConfig;
}

function writeTournamentHomeConfig(config: TournamentHomeConfig) {
  fs.mkdirSync(path.dirname(TOURNAMENT_HOME_CONFIG_PATH), { recursive: true });
  fs.writeFileSync(
    TOURNAMENT_HOME_CONFIG_PATH,
    JSON.stringify(
      {
        ...config,
        updated_at: new Date().toISOString(),
      },
      null,
      2
    ),
    "utf8"
  );
}

function normalizeText(value: string | null | undefined) {
  return String(value || "").trim();
}

function createPlaceholderPlayer(
  teamName: string,
  fallbackIndex: number,
  placeholder: TournamentPlaceholderPlayerConfig
): Player {
  const playerName = normalizeText(placeholder.name) || `임시선수 ${fallbackIndex + 1}`;
  const race = normalizeText(placeholder.race).toUpperCase() || "T";
  const tier = normalizeText(placeholder.tier) || "S";

  return {
    id: `placeholder:${teamName}:${fallbackIndex + 1}:${playerName}`,
    name: playerName,
    race,
    tier,
    university: teamName,
    photo_url: null,
    broadcast_title: null,
    broadcast_url: null,
    channel_profile_image_url: null,
    created_at: null,
    detailed_stats: null,
    elo_point: null,
    eloboard_id: null,
    is_live: false,
    last_synced_at: null,
    live_thumbnail_url: null,
    match_history: null,
    nickname: null,
    soop_id: null,
    tier_rank: null,
    total_losses: null,
    total_wins: null,
    win_rate: null,
    gender: null,
    last_checked_at: null,
    last_match_at: null,
    last_changed_at: null,
    check_priority: null,
    check_interval_days: null,
  };
}

export function buildTournamentHomeTeams(allPlayers: Player[]): TournamentHomeTeam[] {
  const config = readTournamentHomeConfig();
  const byId = new Map(allPlayers.map((player) => [normalizeText(player.id), player]));
  const byName = new Map(
    allPlayers.map((player) => [normalizeText(player.name).toLowerCase(), player])
  );

  return (config.teams || []).slice(0, 6).map((team, index) => {
    const orderedPlayers: Player[] = [];
    const seenIds = new Set<string>();
    const captainPlayerId = normalizeText(team.captain_player_id) || null;
    const captainPlayerName = normalizeText(team.captain_player_name).toLowerCase() || null;

    for (const playerId of team.player_ids || []) {
      const normalizedId = normalizeText(playerId);
      if (!normalizedId || seenIds.has(normalizedId)) continue;
      const player = byId.get(normalizedId);
      if (!player) continue;
      orderedPlayers.push(player);
      seenIds.add(normalizedId);
    }

    for (const playerName of team.player_names || []) {
      const normalizedName = normalizeText(playerName).toLowerCase();
      if (!normalizedName) continue;
      const player = byName.get(normalizedName);
      if (!player || seenIds.has(player.id)) continue;
      orderedPlayers.push(player);
      seenIds.add(player.id);
    }

    for (const [placeholderIndex, placeholderPlayer] of (team.placeholder_players || []).entries()) {
      const fallbackPlayer = createPlaceholderPlayer(
        normalizeText(team.team_name) || `임시 ${index + 1}팀`,
        placeholderIndex,
        placeholderPlayer
      );
      if (seenIds.has(fallbackPlayer.id)) continue;
      orderedPlayers.push(fallbackPlayer);
      seenIds.add(fallbackPlayer.id);
    }

    const captainIndex = orderedPlayers.findIndex((player) => {
      const playerId = normalizeText(player.id);
      const playerName = normalizeText(player.name).toLowerCase();
      return (
        (captainPlayerId && playerId === captainPlayerId) ||
        (captainPlayerName && playerName === captainPlayerName)
      );
    });

    if (captainIndex > 0) {
      const [captainPlayer] = orderedPlayers.splice(captainIndex, 1);
      orderedPlayers.unshift(captainPlayer);
    }

    const visiblePlayers = orderedPlayers.slice(0, TOURNAMENT_TEAM_SIZE).map((player) => {
      const playerId = normalizeText(player.id);
      const playerName = normalizeText(player.name).toLowerCase();
      const isCaptain = Boolean(
        (captainPlayerId && playerId === captainPlayerId) ||
        (captainPlayerName && playerName === captainPlayerName)
      );

      return {
        ...player,
        isCaptain,
      };
    });

    return {
      teamCode: normalizeText(team.team_code) || `team-${index + 1}`,
      teamName: normalizeText(team.team_name) || `임시 ${index + 1}팀`,
      captainPlayerId:
        visiblePlayers.find((player) => player.isCaptain)?.id || captainPlayerId || null,
      players: visiblePlayers,
    };
  });
}

export function updateTournamentTeamCaptain(teamCode: string, captainPlayerId: string | null) {
  const normalizedTeamCode = normalizeText(teamCode);
  if (!normalizedTeamCode) {
    throw new Error("team_code is required");
  }

  const config = readTournamentHomeConfig();
  const team = (config.teams || []).find(
    (item) => normalizeText(item.team_code) === normalizedTeamCode
  );

  if (!team) {
    throw new Error("team not found");
  }

  team.captain_player_id = normalizeText(captainPlayerId || "") || "";
  team.captain_player_name = "";
  writeTournamentHomeConfig(config);
}

export function updateTournamentTeamName(teamCode: string, teamName: string) {
  const normalizedTeamCode = normalizeText(teamCode);
  if (!normalizedTeamCode) {
    throw new Error("team_code is required");
  }

  const config = readTournamentHomeConfig();
  const team = (config.teams || []).find(
    (item) => normalizeText(item.team_code) === normalizedTeamCode
  );

  if (!team) {
    throw new Error("team not found");
  }

  team.team_name = normalizeText(teamName);
  writeTournamentHomeConfig(config);
}
