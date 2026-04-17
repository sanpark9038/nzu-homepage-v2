import Link from "next/link";
import { unstable_noStore as noStore } from "next/cache";
import { isExactPlayerSearchMatch, playerService } from "@/lib/player-service";
import { type Race } from "@/components/ui/nzu-badges";
import PlayerSearchForm from "./PlayerSearchForm";
import PlayerSearchResult from "./PlayerSearchResult";
import { getTierLabel } from "@/lib/utils";
import { buildPlayerHref } from "@/lib/player-route";
import { getUniversityLabel } from "@/lib/university-config";

type PlayerMatch = Awaited<ReturnType<typeof playerService.getPlayerMatches>>[number];
type RaceSummary = {
  race: Race;
  matches: number;
  wins: number;
  losses: number;
  winRate: string;
  hasRecord: boolean;
};
type MapSummary = {
  mapName: string;
  matches: number;
  wins: number;
  losses: number;
  winRate: string;
};
type RaceMapSummary = {
  race: Race;
  bestMap: MapSummary | null;
};
type SpawnPartnerSummary = {
  name: string;
  race: Race;
  matches: number;
  wins: number;
  losses: number;
} | null;
type RecentLog = {
  id: string;
  result: "승" | "패";
  opponentName: string;
  opponentRace: Race;
  mapName: string;
  dateText: string;
};
type RecentSummary = {
  winRate: string;
  wins: number;
  losses: number;
  form: readonly ("승" | "패")[];
};

function normalizeRaceValue(race: string | null | undefined): Race {
  const raw = String(race || "").trim().toUpperCase();
  if (raw.startsWith("Z")) return "Z";
  if (raw.startsWith("P")) return "P";
  return "T";
}

function getWinRate(wins: number, matches: number) {
  if (!matches) return "기록 없음";
  return `${Math.round((wins / matches) * 100)}%`;
}

function formatShortDate(value: string | null | undefined) {
  if (!value) return "--.--.--";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "--.--.--";
  const yy = String(date.getFullYear()).slice(-2);
  const mm = String(date.getMonth() + 1).padStart(2, "0");
  const dd = String(date.getDate()).padStart(2, "0");
  return `${yy}.${mm}.${dd}`;
}

function getOpponent(match: PlayerMatch, playerId: string) {
  if (match.player1_id === playerId) return match.player2;
  return match.player1;
}

function buildRaceSummaries(matches: PlayerMatch[], playerId: string): RaceSummary[] {
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

function buildMapSummaries(matches: PlayerMatch[], playerId: string): MapSummary[] {
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

function sortMapCandidates(items: MapSummary[], direction: "desc" | "asc") {
  return [...items].sort((a, b) => {
    const aRate = a.matches ? a.wins / a.matches : -1;
    const bRate = b.matches ? b.wins / b.matches : -1;
    if (aRate !== bRate) return direction === "desc" ? bRate - aRate : aRate - bRate;
    if (a.matches !== b.matches) return b.matches - a.matches;
    return a.mapName.localeCompare(b.mapName, "ko");
  });
}

function pickMapSummary(items: MapSummary[], direction: "desc" | "asc", minMatches: number) {
  const filtered = items.filter((item) => item.matches >= minMatches);
  if (!filtered.length) return null;
  return sortMapCandidates(filtered, direction)[0];
}

function buildRaceBestMaps(matches: PlayerMatch[], playerId: string): RaceMapSummary[] {
  return (["T", "Z", "P"] as const).map((race) => {
    const scoped = matches.filter((match) => normalizeRaceValue(getOpponent(match, playerId)?.race) === race);
    return {
      race,
      bestMap: pickMapSummary(buildMapSummaries(scoped, playerId), "desc", 3),
    };
  });
}

function buildSpawnPartner(matches: PlayerMatch[], playerId: string): SpawnPartnerSummary {
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

function buildRecentLogs(matches: PlayerMatch[], playerId: string): RecentLog[] {
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

function buildRecentSummary(matches: PlayerMatch[], playerId: string): RecentSummary {
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

async function resolveSelectedPlayer(selectedId: string, selectedIdPrefix: string, query: string) {
  if (selectedId) {
    try {
      return await playerService.getPlayerById(selectedId);
    } catch {
      return null;
    }
  }

  if (selectedIdPrefix) {
    return await playerService.getPlayerByIdPrefix(selectedIdPrefix);
  }

  if (query) {
    const results = await playerService.searchPlayers(query);
    return results.find((player) => isExactPlayerSearchMatch(player, query)) || null;
  }

  return null;
}

export async function PlayerPageView({
  query = "",
  selectedId = "",
  selectedIdPrefix = "",
}: {
  query?: string;
  selectedId?: string;
  selectedIdPrefix?: string;
}) {
  noStore();
  const normalizedQuery = String(query || "").trim();
  const normalizedId = String(selectedId || "").trim();
  const normalizedIdPrefix = String(selectedIdPrefix || "").trim();
  const hasQuery = normalizedQuery.length > 0;
  const hasSelectedId = normalizedId.length > 0 || normalizedIdPrefix.length > 0;
  const shouldExpandDetailByDefault = hasSelectedId;

  let exactMatch: Awaited<ReturnType<typeof playerService.searchPlayers>>[number] | null = null;
  let candidates: Awaited<ReturnType<typeof playerService.searchPlayers>> = [];
  let raceSummaries: RaceSummary[] = [];
  let strongestMap: MapSummary | null = null;
  let weakestMap: MapSummary | null = null;
  let raceBestMaps: RaceMapSummary[] = [];
  let spawnPartner: SpawnPartnerSummary = null;
  let recentLogs: RecentLog[] = [];
  let recentSummary: RecentSummary = { winRate: "기록 없음", wins: 0, losses: 0, form: [] };

  if (hasSelectedId) {
    exactMatch = await resolveSelectedPlayer(normalizedId, normalizedIdPrefix, normalizedQuery);
  } else if (hasQuery) {
    const results = await playerService.searchPlayers(normalizedQuery);
    const exact = results.find((player) => isExactPlayerSearchMatch(player, normalizedQuery)) || null;
    exactMatch = exact
      ? await playerService.getPlayerById(exact.id).catch(() => exact)
      : null;
    candidates = exact ? results.filter((player) => player.id !== exact.id) : results;
  }

  if (exactMatch) {
    const matchLimit = Math.max((exactMatch.total_wins ?? 0) + (exactMatch.total_losses ?? 0), 20);
    const exactMatchMatches = await playerService.getPlayerMatches(exactMatch.id, matchLimit);
    raceSummaries = buildRaceSummaries(exactMatchMatches, exactMatch.id);
    const mapSummaries = buildMapSummaries(exactMatchMatches, exactMatch.id);
    strongestMap = pickMapSummary(mapSummaries, "desc", 5);
    weakestMap = pickMapSummary(mapSummaries, "asc", 5);
    raceBestMaps = buildRaceBestMaps(exactMatchMatches, exactMatch.id);
    spawnPartner = buildSpawnPartner(exactMatchMatches, exactMatch.id);
    recentLogs = buildRecentLogs(exactMatchMatches, exactMatch.id);
    recentSummary = buildRecentSummary(exactMatchMatches, exactMatch.id);
  }

  const initialSearchValue = normalizedQuery || exactMatch?.name || "";

  return (
    <main className="min-h-[calc(100vh-4rem)] bg-background px-4 py-4 text-foreground md:px-8 xl:px-10">
      <div className="mx-auto flex max-w-[96rem] flex-col items-center pt-4 md:pt-5">
        <section className="w-full max-w-6xl overflow-hidden rounded-[2rem] border border-white/8 bg-[linear-gradient(180deg,rgba(8,17,18,0.94),rgba(6,10,11,0.92))] px-5 py-4 shadow-[0_24px_80px_rgba(0,0,0,0.34)] md:overflow-visible md:px-7 md:py-5 xl:max-w-[84rem] xl:px-8">
          <div className="mb-4">
            <Link
              href="/tier"
              className="inline-flex items-center gap-2 text-[0.78rem] font-[1000] tracking-tight text-white/34 transition-all hover:text-nzu-green"
            >
              <span aria-hidden>←</span>
              <span>티어표로 돌아가기</span>
            </Link>
          </div>

          <div className="text-center">
            <h1 className="text-[2rem] font-[1000] tracking-tighter italic text-white md:text-[2.65rem] xl:text-[2.9rem]">
              선수 <span className="text-nzu-green drop-shadow-[0_0_15px_#00ffa344]">검색</span>
            </h1>
            <p className="mx-auto mt-1.5 max-w-2xl text-[0.92rem] font-semibold text-white/45 md:text-[0.98rem] xl:text-[1rem]">
              선수 이름을 입력하면 현재 제공 중인 선수 정보와 통계를 확인할 수 있습니다.
            </p>
          </div>

          <PlayerSearchForm initialQuery={initialSearchValue} />
          {hasQuery || hasSelectedId ? (
            <div className="mt-4 space-y-4">
              {exactMatch ? (
                <div className="space-y-2">
                  {candidates.length > 0 ? (
                    <div className="flex justify-start">
                      <span className="inline-flex items-center rounded-full border border-nzu-green/18 bg-nzu-green/[0.05] px-2.5 py-0.5 text-[0.72rem] font-[1000] tracking-tight text-nzu-green/90">
                        현재 보고 있는 선수
                      </span>
                    </div>
                  ) : null}
                  <PlayerSearchResult
                    player={exactMatch}
                    raceSummaries={raceSummaries}
                    strongestMap={strongestMap}
                    weakestMap={weakestMap}
                    raceBestMaps={raceBestMaps}
                    spawnPartner={spawnPartner}
                    recentLogs={recentLogs}
                    recentSummary={recentSummary}
                    defaultExpanded={shouldExpandDetailByDefault}
                  />
                </div>
              ) : null}

              {!exactMatch && candidates.length > 0 ? (
                <div className="rounded-[1.35rem] border border-white/8 bg-white/[0.03] px-5 py-5">
                  <p className="text-sm font-[1000] text-white">정확히 일치하는 선수는 없지만, 비슷한 결과가 있습니다.</p>
                </div>
              ) : null}

              {candidates.length > 0 ? (
                <div className="space-y-2">
                  {candidates.slice(0, 8).map((player) => (
                    <Link
                      key={player.id}
                      href={buildPlayerHref(player)}
                      className="group flex items-center justify-between gap-3 rounded-[1.15rem] border border-white/8 bg-white/[0.03] px-4 py-3 transition-all hover:border-nzu-green/24 hover:bg-nzu-green/[0.04]"
                    >
                      <div className="min-w-0">
                        <div className="flex flex-wrap items-center gap-2">
                          <p className="text-sm font-[1000] text-white transition-colors group-hover:text-nzu-green">{player.name}</p>
                        </div>
                        <p className="mt-1 truncate text-xs text-white/42">
                          {[getUniversityLabel(player.university), getTierLabel(player.tier), normalizeRaceValue(player.race)].join(" · ")}
                        </p>
                      </div>
                      <span className="shrink-0 text-xs font-[1000] text-nzu-green/82 transition-colors group-hover:text-nzu-green">결과 보기</span>
                    </Link>
                  ))}
                </div>
              ) : null}

              {!exactMatch && hasSelectedId ? (
                <div className="rounded-[1.35rem] border border-dashed border-white/10 px-5 py-6 text-center text-sm text-white/38">
                  해당 선수 정보를 찾을 수 없습니다.
                </div>
              ) : null}

              {!exactMatch && !hasSelectedId && candidates.length === 0 ? (
                <div className="rounded-[1.35rem] border border-dashed border-white/10 px-5 py-6 text-center text-sm text-white/38">
                  검색 결과가 없습니다.
                </div>
              ) : null}
            </div>
          ) : null}
        </section>
      </div>
    </main>
  );
}
