import type { Race } from "@/components/ui/nzu-badges";
import { type playerService } from "@/lib/player-service";

export type PlayerMatch = Awaited<ReturnType<typeof playerService.getPlayerMatches>>[number];

export type RaceSummary = {
  race: Race;
  matches: number;
  wins: number;
  losses: number;
  winRate: string;
  hasRecord: boolean;
};

export type MapSummary = {
  mapName: string;
  matches: number;
  wins: number;
  losses: number;
  winRate: string;
};

export type RaceMapSummary = {
  race: Race;
  bestMap: MapSummary | null;
};

export type SpawnPartnerSummary = {
  name: string;
  race: Race;
  matches: number;
  wins: number;
  losses: number;
} | null;

export type RecentLog = {
  id: string;
  result: "승" | "패";
  opponentName: string;
  opponentRace: Race;
  mapName: string;
  dateText: string;
};

export type RecentSummary = {
  winRate: string;
  wins: number;
  losses: number;
  form: readonly ("승" | "패")[];
};

export function normalizeRaceValue(race: string | null | undefined): Race {
  const raw = String(race || "").trim().toUpperCase();
  if (raw.startsWith("Z")) return "Z";
  if (raw.startsWith("P")) return "P";
  return "T";
}

export function getWinRate(wins: number, matches: number) {
  if (!matches) return "기록 없음";
  return `${Math.round((wins / matches) * 100)}%`;
}

export function formatShortDate(value: string | null | undefined) {
  if (!value) return "--.--.--";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "--.--.--";
  const yy = String(date.getFullYear()).slice(-2);
  const mm = String(date.getMonth() + 1).padStart(2, "0");
  const dd = String(date.getDate()).padStart(2, "0");
  return `${yy}.${mm}.${dd}`;
}

export function getOpponent(match: PlayerMatch, playerId: string) {
  if (match.player1_id === playerId) return match.player2;
  return match.player1;
}

export function buildRaceSummaries(matches: PlayerMatch[], playerId: string): RaceSummary[] {
  return (["T", "Z", "P"] as const).map((race) => {
    const scoped = matches.filter((match) => normalizeRaceValue(getOpponent(match, playerId)?.race) === race);
    const wins = scoped.filter((match) => match.winner_id === playerId).length;
    return {
      race,
      matches: scoped.length,
      wins,
      losses: scoped.length - wins,
      winRate: getWinRate(wins, scoped.length),
      hasRecord: scoped.length > 0,
    };
  });
}

export function buildMapSummaries(matches: PlayerMatch[], playerId: string): MapSummary[] {
  const bucket = new Map<string, { wins: number; matches: number }>();
  for (const match of matches) {
    const mapName = String(match.map_name || "").trim();
    if (!mapName) continue;
    const entry = bucket.get(mapName) || { wins: 0, matches: 0 };
    entry.matches += 1;
    if (match.winner_id === playerId) entry.wins += 1;
    bucket.set(mapName, entry);
  }
  return Array.from(bucket.entries()).map(([mapName, value]) => ({
    mapName,
    matches: value.matches,
    wins: value.wins,
    losses: value.matches - value.wins,
    winRate: getWinRate(value.wins, value.matches),
  }));
}

export function sortMapCandidates(items: MapSummary[], direction: "desc" | "asc") {
  return [...items].sort((a, b) => {
    const aRate = a.matches ? a.wins / a.matches : -1;
    const bRate = b.matches ? b.wins / b.matches : -1;
    if (aRate !== bRate) return direction === "desc" ? bRate - aRate : aRate - bRate;
    if (a.matches !== b.matches) return b.matches - a.matches;
    return a.mapName.localeCompare(b.mapName, "ko");
  });
}

export function pickMapSummary(items: MapSummary[], direction: "desc" | "asc", minMatches: number) {
  const filtered = items.filter((item) => item.matches >= minMatches);
  if (!filtered.length) return null;
  return sortMapCandidates(filtered, direction)[0];
}

export function buildRaceBestMaps(matches: PlayerMatch[], playerId: string): RaceMapSummary[] {
  return (["T", "Z", "P"] as const).map((race) => {
    const scoped = matches.filter((match) => normalizeRaceValue(getOpponent(match, playerId)?.race) === race);
    return {
      race,
      bestMap: pickMapSummary(buildMapSummaries(scoped, playerId), "desc", 3),
    };
  });
}

export function buildSpawnPartner(matches: PlayerMatch[], playerId: string): SpawnPartnerSummary {
  const now = Date.now();
  const ninetyDaysAgo = now - 1000 * 60 * 60 * 24 * 90;
  const bucket = new Map<string, { name: string; race: Race; matches: number; wins: number; recentMatches: number; latestAt: number }>();
  for (const match of matches) {
    const opponent = getOpponent(match, playerId);
    if (!opponent?.id) continue;
    const key = opponent.id;
    const playedAt = match.match_date ? new Date(match.match_date).getTime() : 0;
    const entry = bucket.get(key) || {
      name: opponent.name || "알 수 없음",
      race: normalizeRaceValue(opponent.race),
      matches: 0,
      wins: 0,
      recentMatches: 0,
      latestAt: 0,
    };
    entry.matches += 1;
    if (match.winner_id === playerId) entry.wins += 1;
    if (playedAt >= ninetyDaysAgo) entry.recentMatches += 1;
    if (playedAt > entry.latestAt) entry.latestAt = playedAt;
    bucket.set(key, entry);
  }
  const partner = Array.from(bucket.values()).sort((a, b) => {
    if (a.matches !== b.matches) return b.matches - a.matches;
    if (a.recentMatches !== b.recentMatches) return b.recentMatches - a.recentMatches;
    if (a.latestAt !== b.latestAt) return b.latestAt - a.latestAt;
    return a.name.localeCompare(b.name, "ko");
  })[0];
  if (!partner) return null;
  return {
    name: partner.name,
    race: partner.race,
    matches: partner.matches,
    wins: partner.wins,
    losses: partner.matches - partner.wins,
  };
}

export function buildRecentLogs(matches: PlayerMatch[], playerId: string): RecentLog[] {
  return matches.map((match) => {
    const opponent = getOpponent(match, playerId);
    return {
      id: String(match.id),
      result: match.winner_id === playerId ? "승" : "패",
      opponentName: opponent?.name || "알 수 없음",
      opponentRace: normalizeRaceValue(opponent?.race),
      mapName: String(match.map_name || "맵 정보 없음").trim() || "맵 정보 없음",
      dateText: formatShortDate(match.match_date),
    };
  });
}

export function buildRecentSummary(matches: PlayerMatch[], playerId: string): RecentSummary {
  const now = Date.now();
  const ninetyDaysAgo = now - 1000 * 60 * 60 * 24 * 90;
  const recentWindow = matches.filter((match) => {
    const playedAt = match.match_date ? new Date(match.match_date).getTime() : 0;
    return playedAt >= ninetyDaysAgo;
  });
  const wins = recentWindow.filter((match) => match.winner_id === playerId).length;
  const losses = recentWindow.length - wins;
  const form = matches
    .slice(0, 5)
    .reverse()
    .map((match) => (match.winner_id === playerId ? "승" : "패")) as ("승" | "패")[];
  return {
    winRate: getWinRate(wins, recentWindow.length),
    wins,
    losses,
    form,
  };
}
