import type { Database } from "@/lib/database.types";
import { buildPredictionUniversityTeams } from "@/lib/prediction-admin-teams";
import { buildTournamentHomeTeams } from "@/lib/tournament-home";
import {
  derivePredictionMatchStatus,
  readPredictionConfig,
  readPredictionVotes,
  type PredictionConfigMatch,
  type PredictionDerivedStatus,
  type PredictionEntryOrderStatus,
  type PredictionVoteTotalRow,
  type PredictionVoteRow,
} from "@/lib/prediction-store";

export type { PredictionConfigMatch } from "@/lib/prediction-store";
export { readPredictionConfig, updatePredictionMatches, upsertPredictionVote } from "@/lib/prediction-store";

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
  | "created_at"
  | "detailed_stats"
  | "elo_point"
  | "eloboard_id"
  | "is_live"
  | "last_synced_at"
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
  channel_profile_image_url?: PlayerRow["channel_profile_image_url"] | null;
  live_thumbnail_url?: PlayerRow["live_thumbnail_url"] | null;
  match_history?: PlayerRow["match_history"] | null;
};

export type PredictionMatchTeam = {
  teamCode: string;
  teamName: string;
  players: Array<{
    id: string;
    name: string;
    race: string | null;
    tier: string | null;
  }>;
};

export type PredictionEntryMatchupSnapshot = {
  id: string;
  label: string;
  playerA: PredictionMatchTeam["players"][number] | null;
  playerB: PredictionMatchTeam["players"][number] | null;
};

export type PredictionMatchSnapshot = {
  id: string;
  matchType: "team" | "individual";
  teamMode: "existing" | "direct";
  title: string;
  startAt: string;
  startTimeTbd: boolean;
  lockAt: string;
  status: PredictionDerivedStatus;
  resultTeamCode: string | null;
  resultPublishedAt: string | null;
  entryOrderStatus: PredictionEntryOrderStatus;
  entryMatchups: PredictionEntryMatchupSnapshot[];
  teamA: PredictionMatchTeam;
  teamB: PredictionMatchTeam;
  totalTeamVotes: number;
  totalMvpVotes: number;
  teamVotes: Record<string, number>;
  mvpVotes: Record<string, number>;
};

function pairTeamsFallback(teams: ReturnType<typeof buildTournamentHomeTeams>): PredictionConfigMatch[] {
  const count = teams.length >= 6 ? 3 : teams.length >= 4 ? 2 : Math.floor(teams.length / 2);
  const base = new Date();
  const rows: PredictionConfigMatch[] = [];

  for (let i = 0; i < count; i += 1) {
    const teamA = teams[i * 2];
    const teamB = teams[i * 2 + 1];
    if (!teamA || !teamB) continue;

    const start = new Date(base);
    start.setDate(base.getDate() + i + 1);
    start.setHours(19 + i, 0, 0, 0);

    rows.push({
      id: `match-${i + 1}`,
      match_type: "team",
      team_mode: "existing",
      team_a_code: teamA.teamCode,
      team_b_code: teamB.teamCode,
      start_at: start.toISOString(),
      title: `${teamA.teamName} vs ${teamB.teamName}`,
    });
  }

  return rows;
}

function computeLockAt(startAt: string) {
  const start = new Date(startAt);
  return new Date(start.getTime() - 30 * 60 * 1000).toISOString();
}

function timestampForSort(value: string) {
  const time = new Date(value).getTime();
  return Number.isFinite(time) ? time : Number.MAX_SAFE_INTEGER;
}

function normalizeIdList(value: unknown) {
  if (!Array.isArray(value)) return [];
  const seen = new Set<string>();
  const rows: string[] = [];
  for (const item of value) {
    const id = String(item || "").trim();
    if (!id || seen.has(id)) continue;
    seen.add(id);
    rows.push(id);
  }
  return rows;
}

function normalizeMatchType(value: unknown): "team" | "individual" {
  return String(value || "").trim().toLowerCase() === "individual" ? "individual" : "team";
}

function normalizeTeamMode(value: unknown): "existing" | "direct" {
  return String(value || "").trim().toLowerCase() === "direct" ? "direct" : "existing";
}

function normalizeEntryOrderStatus(value: unknown): PredictionEntryOrderStatus {
  return String(value || "").trim().toLowerCase() === "confirmed" ? "confirmed" : "unknown";
}

function toPredictionPlayer(player: Pick<Player, "id" | "name"> & { race?: string | null; tier?: string | null }) {
  return {
    id: player.id,
    name: player.name,
    race: player.race || "",
    tier: player.tier || "",
  };
}

function selectTeamPlayers<T extends { id: string }>(players: T[], selectedIds: unknown) {
  const ids = normalizeIdList(selectedIds);
  if (ids.length === 0) return players;
  const byId = new Map(players.map((player) => [String(player.id), player]));
  return ids.map((id) => byId.get(id)).filter((player): player is T => Boolean(player));
}

function selectGlobalPlayers<T extends { id: string }>(playerMap: Map<string, T>, selectedIds: unknown) {
  return normalizeIdList(selectedIds)
    .map((id) => playerMap.get(id))
    .filter((player): player is T => Boolean(player));
}

function normalizeEntryMatchups(
  match: PredictionConfigMatch,
  playerMap: Map<string, Player>,
  entryOrderStatus: PredictionEntryOrderStatus
): PredictionEntryMatchupSnapshot[] {
  if (!Array.isArray(match.entry_matchups)) return [];
  return match.entry_matchups.reduce<PredictionEntryMatchupSnapshot[]>((rows, row, index) => {
    const playerAId = String(row?.player_a_id || "").trim();
    const playerBId = String(row?.player_b_id || "").trim();
    const playerA = playerAId ? playerMap.get(playerAId) || null : null;
    const playerB = playerBId ? playerMap.get(playerBId) || null : null;
    if (!playerA && !playerB) return rows;
    rows.push({
      id: String(row?.id || `matchup-${index + 1}`),
      label:
        String(row?.label || "").trim() ||
        (entryOrderStatus === "confirmed" ? `${index + 1}경기` : `매치${index + 1}`),
      playerA: playerA ? toPredictionPlayer(playerA) : null,
      playerB: playerB ? toPredictionPlayer(playerB) : null,
    });
    return rows;
  }, []);
}

export function buildTournamentPredictionMatches(
  allPlayers: Player[],
  state?: { matches?: PredictionConfigMatch[]; votes?: PredictionVoteRow[]; voteTotals?: PredictionVoteTotalRow[] }
): PredictionMatchSnapshot[] {
  const teams = buildTournamentHomeTeams(allPlayers);
  const existingTeams = buildPredictionUniversityTeams(allPlayers);
  const teamMap = new Map([
    ...teams.map((team) => [team.teamCode, team] as const),
    ...existingTeams.map((team) => [team.teamCode, team] as const),
  ]);
  const playerMap = new Map(allPlayers.map((player) => [String(player.id), player]));
  const config = readPredictionConfig();
  const configMatches =
    Array.isArray(state?.matches)
      ? state.matches
      : Array.isArray(config.matches) && config.matches.length > 0
        ? config.matches
        : pairTeamsFallback(teams);

  const votes = Array.isArray(state?.votes) ? state.votes : readPredictionVotes();
  const voteTotals = Array.isArray(state?.voteTotals) ? state.voteTotals : null;

  const visibleConfigMatches = configMatches.filter(
    (match) => derivePredictionMatchStatus(match) !== "archived"
  );

  const snapshotRows = visibleConfigMatches.map((match, index): PredictionMatchSnapshot | null => {
    const matchType = normalizeMatchType(match.match_type);
    const teamMode = normalizeTeamMode(match.team_mode);
    const teamACode = String(match.team_a_code || "").trim();
    const teamBCode = String(match.team_b_code || "").trim();
    const entryOrderStatus = normalizeEntryOrderStatus(match.entry_order_status);

    let teamA: PredictionMatchTeam | null = null;
    let teamB: PredictionMatchTeam | null = null;

    if (matchType === "individual") {
      const [playerA] = selectGlobalPlayers(playerMap, match.team_a_player_ids);
      const [playerB] = selectGlobalPlayers(playerMap, match.team_b_player_ids);
      if (!playerA || !playerB) return null;
      teamA = {
        teamCode: teamACode || `player:${playerA.id}`,
        teamName: String(match.team_a_name || "").trim() || playerA.name,
        players: [toPredictionPlayer(playerA)],
      };
      teamB = {
        teamCode: teamBCode || `player:${playerB.id}`,
        teamName: String(match.team_b_name || "").trim() || playerB.name,
        players: [toPredictionPlayer(playerB)],
      };
    } else if (teamMode === "direct") {
      const teamAPlayers = selectGlobalPlayers(playerMap, match.team_a_player_ids);
      const teamBPlayers = selectGlobalPlayers(playerMap, match.team_b_player_ids);
      teamA = {
        teamCode: teamACode || "event-team-a",
        teamName: String(match.team_a_name || "").trim() || teamACode || "A팀",
        players: teamAPlayers.map(toPredictionPlayer),
      };
      teamB = {
        teamCode: teamBCode || "event-team-b",
        teamName: String(match.team_b_name || "").trim() || teamBCode || "B팀",
        players: teamBPlayers.map(toPredictionPlayer),
      };
    } else {
      const sourceTeamA = teamMap.get(teamACode);
      const sourceTeamB = teamMap.get(teamBCode);
      if (!sourceTeamA || !sourceTeamB) return null;
      const teamAPlayers = selectTeamPlayers(sourceTeamA.players, match.team_a_player_ids);
      const teamBPlayers = selectTeamPlayers(sourceTeamB.players, match.team_b_player_ids);
      teamA = {
        teamCode: sourceTeamA.teamCode,
        teamName: String(match.team_a_name || "").trim() || sourceTeamA.teamName,
        players: teamAPlayers.map(toPredictionPlayer),
      };
      teamB = {
        teamCode: sourceTeamB.teamCode,
        teamName: String(match.team_b_name || "").trim() || sourceTeamB.teamName,
        players: teamBPlayers.map(toPredictionPlayer),
      };
    }

    if (!teamA || !teamB) return null;

    const matchId = String(match.id || `match-${index + 1}`).trim();
    const startAt = String(match.start_at || "").trim() || new Date().toISOString();
    const lockAt = String(match.close_at || "").trim() || computeLockAt(startAt);
    const matchVotes = voteTotals ? [] : votes.filter((vote) => vote.match_id === matchId);
    const matchVoteTotals = voteTotals
      ? voteTotals.filter((row) => String(row.match_id || "").trim() === matchId)
      : [];
    const status = derivePredictionMatchStatus({ ...match, start_at: startAt, close_at: lockAt });
    const entryMatchups = matchType === "team" ? normalizeEntryMatchups(match, playerMap, entryOrderStatus) : [];

    const teamVotes: Record<string, number> = {
      [teamA.teamCode]: 0,
      [teamB.teamCode]: 0,
    };

    const mvpVotes: Record<string, number> = {};
    for (const player of [...teamA.players, ...teamB.players]) {
      mvpVotes[player.id] = 0;
    }

    if (voteTotals) {
      for (const row of matchVoteTotals) {
        const count = Number(row.vote_count || 0);
        if (row.picked_team_code && teamVotes[row.picked_team_code] !== undefined) {
          teamVotes[row.picked_team_code] += count;
        }
        if (row.picked_player_id && mvpVotes[row.picked_player_id] !== undefined) {
          mvpVotes[row.picked_player_id] += count;
        }
      }
    } else {
      for (const vote of matchVotes) {
        if (vote.picked_team_code && teamVotes[vote.picked_team_code] !== undefined) {
          teamVotes[vote.picked_team_code] += 1;
        }
        if (vote.picked_player_id && mvpVotes[vote.picked_player_id] !== undefined) {
          mvpVotes[vote.picked_player_id] += 1;
        }
      }
    }

    return {
      id: matchId,
      matchType,
      teamMode,
      title: String(match.title || `${teamA.teamName} vs ${teamB.teamName}`),
      startAt,
      startTimeTbd: match.start_time_tbd === true,
      lockAt,
      status,
      resultTeamCode: String(match.result_team_code || "").trim() || null,
      resultPublishedAt: String(match.result_published_at || "").trim() || null,
      entryOrderStatus,
      entryMatchups,
      teamA,
      teamB,
      totalTeamVotes: Object.values(teamVotes).reduce((sum, value) => sum + value, 0),
      totalMvpVotes: Object.values(mvpVotes).reduce((sum, value) => sum + value, 0),
      teamVotes,
      mvpVotes,
    };
  });

  return snapshotRows
    .filter((match): match is PredictionMatchSnapshot => match !== null)
    .sort(
      (left, right) =>
        timestampForSort(left.lockAt) - timestampForSort(right.lockAt) ||
        timestampForSort(left.startAt) - timestampForSort(right.startAt) ||
        left.title.localeCompare(right.title, "ko-KR") ||
        left.id.localeCompare(right.id)
    );
}
