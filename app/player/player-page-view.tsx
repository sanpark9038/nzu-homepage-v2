import { unstable_noStore as noStore } from "next/cache";
import Link from "next/link";

import {
  buildPlayerDetailSummary,
  getEmptyPlayerDetailSummary,
  getPrecomputedPlayerDetailSummary,
} from "@/lib/player-detail-summary";
import { buildPlayerHref } from "@/lib/player-route";
import { isExactPlayerSearchMatch, playerService, type Player } from "@/lib/player-service";
import { normalizeRaceValue } from "@/lib/player-matchup-summary";
import { getUniversityLabel } from "@/lib/university-config";
import { getTierLabel } from "@/lib/utils";

import PlayerSearchForm from "./PlayerSearchForm";
import PlayerSearchResult from "./PlayerSearchResult";

async function resolveSelectedPlayer(
  selectedId: string,
  selectedIdPrefix: string,
  query: string,
  initialPlayer?: Player | null
) {
  if (initialPlayer) return initialPlayer;

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

function buildPlayerCardPayload(player: Player): Player {
  return {
    ...player,
    detailed_stats: null,
    match_history: null,
  };
}

export async function PlayerPageView({
  query = "",
  selectedId = "",
  selectedIdPrefix = "",
  initialPlayer = null,
}: {
  query?: string;
  selectedId?: string;
  selectedIdPrefix?: string;
  initialPlayer?: Player | null;
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
  let detailSummary = getEmptyPlayerDetailSummary();
  let detailSummaryLoaded = false;

  if (hasSelectedId) {
    exactMatch = await resolveSelectedPlayer(normalizedId, normalizedIdPrefix, normalizedQuery, initialPlayer);
  } else if (hasQuery) {
    const results = await playerService.searchPlayers(normalizedQuery);
    const exact = results.find((player) => isExactPlayerSearchMatch(player, normalizedQuery)) || null;
    exactMatch = exact ? await playerService.getPlayerById(exact.id).catch(() => exact) : null;
    candidates = exact ? results.filter((player) => player.id !== exact.id) : results;
  }

  if (exactMatch) {
    detailSummary = getPrecomputedPlayerDetailSummary(exactMatch);
  }

  if (exactMatch && shouldExpandDetailByDefault) {
    detailSummary = await buildPlayerDetailSummary(exactMatch);
    detailSummaryLoaded = true;
  }

  const initialSearchValue = normalizedQuery || exactMatch?.name || "";

  return (
    <main className="min-h-[calc(100vh-4rem)] bg-background px-4 py-4 text-foreground md:px-8 xl:px-10">
      <div className="mx-auto flex max-w-[96rem] flex-col items-center pt-4 md:pt-5">
        <section className="w-full max-w-6xl overflow-hidden rounded-[2rem] border border-white/8 bg-[linear-gradient(180deg,rgba(8,17,18,0.94),rgba(6,10,11,0.92))] px-5 py-4 shadow-[0_24px_80px_rgba(0,0,0,0.34)] md:overflow-visible md:px-7 md:py-5 xl:max-w-[84rem] xl:px-8">
          <div className="mb-4">
            <Link href="/tier" className="inline-flex items-center gap-2 text-[0.78rem] font-[1000] tracking-tight text-white/34 transition-all hover:text-nzu-green">
              <span aria-hidden>←</span>
              <span>티어표로 돌아가기</span>
            </Link>
          </div>

          <div className="text-center">
            <h1 className="text-[2rem] font-[1000] tracking-tighter italic text-white md:text-[2.65rem] xl:text-[2.9rem]">
              선수 <span className="text-nzu-green drop-shadow-[0_0_15px_#00ffa344]">검색</span>
            </h1>
            <p className="mx-auto mt-1.5 max-w-2xl text-[0.92rem] font-semibold text-white/45 md:text-[0.98rem] xl:text-[1rem]">
              선수 이름으로 검색하면 통산 기록과 최근 흐름, 종족전 요약, 주요 맵 지표를 한 번에 확인할 수 있습니다.
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
                        가장 가까운 결과
                      </span>
                    </div>
                  ) : null}
                  <PlayerSearchResult
                    player={buildPlayerCardPayload(exactMatch)}
                    raceSummaries={detailSummary.raceSummaries}
                    strongestMap={detailSummary.strongestMap}
                    weakestMap={detailSummary.weakestMap}
                    raceBestMaps={detailSummary.raceBestMaps}
                    spawnPartner={detailSummary.spawnPartner}
                    recentLogs={detailSummary.recentLogs}
                    recentSummary={detailSummary.recentSummary}
                    defaultExpanded={shouldExpandDetailByDefault}
                    detailSummaryLoaded={detailSummaryLoaded}
                    detailSummaryEndpoint={`/api/player-detail-summary?id=${encodeURIComponent(exactMatch.id)}`}
                  />
                </div>
              ) : null}

              {!exactMatch && candidates.length > 0 ? (
                <div className="rounded-[1.35rem] border border-white/8 bg-white/[0.03] px-5 py-5">
                  <p className="text-sm font-[1000] text-white">정확히 일치하는 선수는 없지만, 비슷한 이름의 선수를 찾았습니다.</p>
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
                      <span className="shrink-0 text-xs font-[1000] text-nzu-green/82 transition-colors group-hover:text-nzu-green">선수 보기</span>
                    </Link>
                  ))}
                </div>
              ) : null}

              {!exactMatch && hasSelectedId ? (
                <div className="rounded-[1.35rem] border border-dashed border-white/10 px-5 py-6 text-center text-sm text-white/38">
                  선택한 선수 정보를 찾지 못했습니다.
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
