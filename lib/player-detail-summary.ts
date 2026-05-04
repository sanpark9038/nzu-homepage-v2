import { unstable_cache } from "next/cache";

import {
  buildMapSummaries,
  buildRaceBestMaps,
  buildRaceSummaries,
  buildRecentLogs,
  buildRecentSummary,
  formatShortDate,
  buildSpawnPartner,
  getWinRate,
  pickMapSummary,
  type MapSummary,
  type RaceMapSummary,
  type RaceSummary,
  type RecentLog,
  type RecentSummary,
  type SpawnPartnerSummary,
} from "@/lib/player-matchup-summary";
import { playerService, type Player } from "@/lib/player-service";

export const PLAYER_DETAIL_RECENT_LOG_LIMIT = 25;

export type PlayerDetailSummary = {
  raceSummaries: RaceSummary[];
  strongestMap: MapSummary | null;
  weakestMap: MapSummary | null;
  raceBestMaps: RaceMapSummary[];
  spawnPartner: SpawnPartnerSummary;
  recentLogs: RecentLog[];
  recentSummary: RecentSummary;
};

export function getEmptyPlayerDetailSummary(): PlayerDetailSummary {
  return {
    raceSummaries: [],
    strongestMap: null,
    weakestMap: null,
    raceBestMaps: [],
    spawnPartner: null,
    recentLogs: [],
    recentSummary: { winRate: getWinRate(0, 0), wins: 0, losses: 0, form: [] },
  };
}

function asRecord(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  return value as Record<string, unknown>;
}

function toNonNegativeInteger(value: unknown) {
  const numberValue = Number(value);
  if (!Number.isFinite(numberValue) || numberValue < 0) return 0;
  return Math.trunc(numberValue);
}

function normalizePrecomputedResult(value: unknown): "승" | "패" | null {
  const raw = String(value || "").trim().toUpperCase();
  if (raw === "W" || raw === "WIN" || raw === "승") return "승";
  if (raw === "L" || raw === "LOSS" || raw === "패") return "패";
  return null;
}

function normalizeProjectionDate(value: unknown) {
  const match = String(value || "").match(/^\d{4}-\d{2}-\d{2}/);
  return match ? match[0] : "";
}

function isProjectionFresh(projectedLatestDate: unknown, playerLastMatchAt: unknown) {
  const projected = normalizeProjectionDate(projectedLatestDate);
  if (!projected) return false;
  const playerLatest = normalizeProjectionDate(playerLastMatchAt);
  return !playerLatest || projected >= playerLatest;
}

function buildPrecomputedRecentSummary(player: Pick<Player, "detailed_stats" | "last_match_at">): RecentSummary {
  const stats = asRecord(player.detailed_stats);
  const recent90 = asRecord(stats?.recent_90);
  if (!isProjectionFresh(recent90?.latest_match_date, player.last_match_at)) {
    return getEmptyPlayerDetailSummary().recentSummary;
  }

  const wins = toNonNegativeInteger(recent90?.wins);
  const losses = toNonNegativeInteger(recent90?.losses);
  const form = Array.isArray(stats?.last_10)
    ? stats.last_10
        .map(normalizePrecomputedResult)
        .filter((result): result is "승" | "패" => Boolean(result))
        .slice(0, 5)
        .reverse()
    : [];

  return {
    winRate: getWinRate(wins, wins + losses),
    wins,
    losses,
    form,
  };
}

function buildMapSummaryFromProjection(value: unknown): MapSummary | null {
  const row = asRecord(value);
  if (!row) return null;
  const mapName = String(row.map_name || row.mapName || "").trim();
  const matches = toNonNegativeInteger(row.matches);
  const wins = toNonNegativeInteger(row.wins);
  const losses = toNonNegativeInteger(row.losses);
  if (!mapName || matches === 0) return null;
  return {
    mapName,
    matches,
    wins,
    losses,
    winRate: getWinRate(wins, matches),
  };
}

function buildRaceSummaryFromProjection(value: unknown): RaceSummary | null {
  const row = asRecord(value);
  if (!row) return null;
  const race = normalizePrecomputedRace(row.race);
  const matches = toNonNegativeInteger(row.matches);
  const wins = toNonNegativeInteger(row.wins);
  const losses = toNonNegativeInteger(row.losses);
  return {
    race,
    matches,
    wins,
    losses,
    winRate: getWinRate(wins, matches),
    hasRecord: matches > 0,
  };
}

function normalizePrecomputedRace(value: unknown): "T" | "Z" | "P" {
  const raw = String(value || "").trim().toUpperCase();
  if (raw.startsWith("Z")) return "Z";
  if (raw.startsWith("P")) return "P";
  return "T";
}

function buildRecentLogFromProjection(value: unknown): RecentLog | null {
  const row = asRecord(value);
  if (!row) return null;
  const result = normalizePrecomputedResult(row.result);
  if (!result) return null;
  return {
    id: String(row.id || `${row.match_date || ""}:${row.opponent_name || ""}`),
    result,
    opponentName: String(row.opponent_name || row.opponentName || "").trim() || "알 수 없음",
    opponentRace: normalizePrecomputedRace(row.opponent_race || row.opponentRace),
    mapName: String(row.map_name || row.mapName || "").trim() || "맵 정보 없음",
    dateText: formatShortDate(String(row.match_date || row.matchDate || "")),
  };
}

function buildSpawnPartnerFromProjection(value: unknown): SpawnPartnerSummary {
  const row = asRecord(value);
  if (!row) return null;
  const name = String(row.name || "").trim();
  const matches = toNonNegativeInteger(row.matches);
  const wins = toNonNegativeInteger(row.wins);
  const losses = toNonNegativeInteger(row.losses);
  if (!name || matches === 0) return null;
  return {
    name,
    race: normalizePrecomputedRace(row.race),
    matches,
    wins,
    losses,
  };
}

export function getPrecomputedFullPlayerDetailSummary(
  player: Pick<Player, "detailed_stats" | "last_match_at">
): PlayerDetailSummary | null {
  const stats = asRecord(player.detailed_stats);
  const projection = asRecord(stats?.player_detail_summary);
  if (!projection || !isProjectionFresh(projection.latest_match_date, player.last_match_at)) return null;

  const raceSummaries = Array.isArray(projection.race_summaries)
    ? projection.race_summaries
        .map(buildRaceSummaryFromProjection)
        .filter((summary): summary is RaceSummary => Boolean(summary))
    : [];
  const raceBestMaps = Array.isArray(projection.race_best_maps)
    ? projection.race_best_maps.map((item) => {
        const row = asRecord(item);
        return {
          race: normalizePrecomputedRace(row?.race),
          bestMap: buildMapSummaryFromProjection(row?.best_map),
        };
      })
    : [];
  const recentLogs = Array.isArray(projection.recent_logs)
    ? projection.recent_logs
        .map(buildRecentLogFromProjection)
        .filter((log): log is RecentLog => Boolean(log))
        .slice(0, PLAYER_DETAIL_RECENT_LOG_LIMIT)
    : [];

  return {
    raceSummaries,
    strongestMap: buildMapSummaryFromProjection(projection.strongest_map),
    weakestMap: buildMapSummaryFromProjection(projection.weakest_map),
    raceBestMaps,
    spawnPartner: buildSpawnPartnerFromProjection(projection.spawn_partner),
    recentLogs,
    recentSummary: buildPrecomputedRecentSummary(player),
  };
}

export function getPrecomputedPlayerDetailSummary(
  player: Pick<Player, "detailed_stats" | "last_match_at">
): PlayerDetailSummary {
  const fullSummary = getPrecomputedFullPlayerDetailSummary(player);
  if (fullSummary) return fullSummary;

  return {
    ...getEmptyPlayerDetailSummary(),
    recentSummary: buildPrecomputedRecentSummary(player),
  };
}

export async function buildPlayerDetailSummary(
  player: Pick<Player, "id" | "total_wins" | "total_losses" | "detailed_stats" | "last_match_at">
): Promise<PlayerDetailSummary> {
  const precomputedSummary = getPrecomputedFullPlayerDetailSummary(player);
  if (precomputedSummary) return precomputedSummary;

  const matchLimit = Math.max((player.total_wins ?? 0) + (player.total_losses ?? 0), 20);
  const exactMatchMatches = await playerService.getPlayerMatches(player.id, matchLimit);
  const mapSummaries = buildMapSummaries(exactMatchMatches, player.id);

  return {
    raceSummaries: buildRaceSummaries(exactMatchMatches, player.id),
    strongestMap: pickMapSummary(mapSummaries, "desc", 5),
    weakestMap: pickMapSummary(mapSummaries, "asc", 5),
    raceBestMaps: buildRaceBestMaps(exactMatchMatches, player.id),
    spawnPartner: buildSpawnPartner(exactMatchMatches, player.id),
    recentLogs: buildRecentLogs(exactMatchMatches, player.id).slice(0, PLAYER_DETAIL_RECENT_LOG_LIMIT),
    recentSummary: buildRecentSummary(exactMatchMatches, player.id),
  };
}

export const getCachedPlayerDetailSummaryById = unstable_cache(
  async (playerId: string) => {
    const player = await playerService.getPlayerById(playerId);
    return buildPlayerDetailSummary(player);
  },
  ["public-player-detail-summary-v1"],
  {
    revalidate: 300,
    tags: ["public-player-history"],
  }
);
