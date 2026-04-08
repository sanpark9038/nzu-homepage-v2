import fs from "node:fs";
import path from "node:path";
import type { Database } from "@/lib/database.types";
import { buildTournamentHomeTeams } from "@/lib/tournament-home";

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
  match_history?: PlayerRow["match_history"] | null;
};

export type PredictionConfigMatch = {
  id?: string;
  team_a_code?: string;
  team_b_code?: string;
  start_at?: string;
  title?: string;
};

type PredictionConfig = {
  schema_version?: string;
  updated_at?: string;
  description?: string;
  matches?: PredictionConfigMatch[];
};

type PredictionVoteRow = {
  voter_id: string;
  match_id: string;
  picked_team_code?: string | null;
  picked_player_id?: string | null;
  change_count?: number;
  updated_at: string;
};

type PredictionVoteDoc = {
  schema_version?: string;
  updated_at?: string;
  votes?: PredictionVoteRow[];
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

export type PredictionMatchSnapshot = {
  id: string;
  title: string;
  startAt: string;
  lockAt: string;
  teamA: PredictionMatchTeam;
  teamB: PredictionMatchTeam;
  totalTeamVotes: number;
  totalMvpVotes: number;
  teamVotes: Record<string, number>;
  mvpVotes: Record<string, number>;
};

const PREDICTION_MATCHES_PATH = path.join(
  process.cwd(),
  "data",
  "metadata",
  "tournament_prediction_matches.v1.json"
);

const PREDICTION_VOTES_PATH = path.join(
  process.cwd(),
  "data",
  "metadata",
  "tournament_prediction_votes.v1.json"
);

const MAX_CHANGES_PER_MATCH = 5;

function readJson<T>(filePath: string, fallback: T): T {
  if (!fs.existsSync(filePath)) return fallback;
  try {
    return JSON.parse(fs.readFileSync(filePath, "utf8").replace(/^\uFEFF/, "")) as T;
  } catch {
    return fallback;
  }
}

function writeJson(filePath: string, value: unknown) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, JSON.stringify(value, null, 2), "utf8");
}

export function readPredictionConfig(): PredictionConfig {
  return readJson<PredictionConfig>(PREDICTION_MATCHES_PATH, { matches: [] });
}

export function updatePredictionMatches(matches: PredictionConfigMatch[]) {
  const config = readPredictionConfig();
  writeJson(PREDICTION_MATCHES_PATH, {
    ...config,
    updated_at: new Date().toISOString(),
    matches: matches.map(m => ({
      id: m.id,
      team_a_code: m.team_a_code,
      team_b_code: m.team_b_code,
      start_at: m.start_at,
      title: m.title
    }))
  });
}

function readPredictionVotes() {
  const doc = readJson<PredictionVoteDoc>(PREDICTION_VOTES_PATH, { votes: [] });
  return Array.isArray(doc.votes) ? doc.votes : [];
}

function writePredictionVotes(rows: PredictionVoteRow[]) {
  writeJson(PREDICTION_VOTES_PATH, {
    schema_version: "1.0.0",
    updated_at: new Date().toISOString(),
    description: "Public tournament prediction votes keyed by browser voter_id.",
    votes: rows,
  });
}

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

export function buildTournamentPredictionMatches(allPlayers: Player[]): PredictionMatchSnapshot[] {
  const teams = buildTournamentHomeTeams(allPlayers);
  const teamMap = new Map(teams.map((team) => [team.teamCode, team]));
  const config = readPredictionConfig();
  const configMatches =
    Array.isArray(config.matches) && config.matches.length > 0
      ? config.matches
      : pairTeamsFallback(teams);

  const votes = readPredictionVotes();

  const snapshotRows = configMatches.map((match, index): PredictionMatchSnapshot | null => {
      const teamA = teamMap.get(String(match.team_a_code || "").trim());
      const teamB = teamMap.get(String(match.team_b_code || "").trim());
      if (!teamA || !teamB) return null;

      const matchId = String(match.id || `match-${index + 1}`).trim();
      const startAt = String(match.start_at || "").trim() || new Date().toISOString();
      const lockAt = computeLockAt(startAt);
      const matchVotes = votes.filter((vote) => vote.match_id === matchId);

      const teamVotes: Record<string, number> = {
        [teamA.teamCode]: 0,
        [teamB.teamCode]: 0,
      };

      const mvpVotes: Record<string, number> = {};
      for (const player of [...teamA.players, ...teamB.players]) {
        mvpVotes[player.id] = 0;
      }

      for (const vote of matchVotes) {
        if (vote.picked_team_code && teamVotes[vote.picked_team_code] !== undefined) {
          teamVotes[vote.picked_team_code] += 1;
        }
        if (vote.picked_player_id && mvpVotes[vote.picked_player_id] !== undefined) {
          mvpVotes[vote.picked_player_id] += 1;
        }
      }

      return {
        id: matchId,
        title: String(match.title || `${teamA.teamName} vs ${teamB.teamName}`),
        startAt,
        lockAt,
        teamA: {
          teamCode: teamA.teamCode,
          teamName: teamA.teamName,
          players: teamA.players.map((player) => ({
            id: player.id,
            name: player.name,
            race: player.race,
            tier: player.tier,
          })),
        },
        teamB: {
          teamCode: teamB.teamCode,
          teamName: teamB.teamName,
          players: teamB.players.map((player) => ({
            id: player.id,
            name: player.name,
            race: player.race,
            tier: player.tier,
          })),
        },
        totalTeamVotes: Object.values(teamVotes).reduce((sum, value) => sum + value, 0),
        totalMvpVotes: Object.values(mvpVotes).reduce((sum, value) => sum + value, 0),
        teamVotes,
        mvpVotes,
      };
    });

  return snapshotRows.filter((match): match is PredictionMatchSnapshot => match !== null);
}

export function upsertPredictionVote(input: {
  voterId: string;
  matchId: string;
  pickedTeamCode?: string | null | undefined;
  pickedPlayerId?: string | null | undefined;
}) {
  const voterId = String(input.voterId || "").trim();
  const matchId = String(input.matchId || "").trim();
  if (!voterId || !matchId) {
    throw new Error("voter_id and match_id are required");
  }

  const votes = readPredictionVotes();
  const existingIndex = votes.findIndex(
    (row) => row.voter_id === voterId && row.match_id === matchId
  );
  const existing = existingIndex >= 0 ? votes[existingIndex] : null;

  const nextPickedTeamCode =
    input.pickedTeamCode === undefined
      ? existing?.picked_team_code || null
      : input.pickedTeamCode;
  const nextPickedPlayerId =
    input.pickedPlayerId === undefined
      ? existing?.picked_player_id || null
      : input.pickedPlayerId;

  const willChangeExisting = Boolean(
    existing &&
      (
        (existing.picked_team_code || null) !== nextPickedTeamCode ||
        (existing.picked_player_id || null) !== nextPickedPlayerId
      )
  );

  const currentChangeCount = Number(existing?.change_count || 0);
  const shouldEnforceLimit = process.env.NODE_ENV === "production";

  if (shouldEnforceLimit && existing && willChangeExisting && currentChangeCount >= MAX_CHANGES_PER_MATCH) {
    throw new Error("change limit reached");
  }

  const next: PredictionVoteRow = {
    voter_id: voterId,
    match_id: matchId,
    picked_team_code: nextPickedTeamCode,
    picked_player_id: nextPickedPlayerId,
    change_count: existing
      ? willChangeExisting
        ? currentChangeCount + 1
        : currentChangeCount
      : 0,
    updated_at: new Date().toISOString(),
  };

  if (existingIndex >= 0) {
    votes[existingIndex] = {
      ...existing,
      ...next,
    };
  } else {
    votes.push(next);
  }

  writePredictionVotes(votes);
}
