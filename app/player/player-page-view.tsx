import { Suspense } from "react";
import Link from "next/link";

import {
  buildPlayerDetailSummary,
  getEmptyPlayerDetailSummary,
  getPrecomputedFullPlayerDetailSummary,
  getPrecomputedPlayerDetailSummary,
} from "@/lib/player-detail-summary";
import { buildPlayerHref } from "@/lib/player-route";
import { isExactPlayerSearchMatch, playerService, type Player } from "@/lib/player-service";
import { normalizeRaceValue } from "@/lib/player-matchup-summary";
import { getUniversityLabel } from "@/lib/university-config";
import { getTierLabel } from "@/lib/utils";
import { Skeleton } from "@/components/ui/Skeleton";

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

async function PlayerResultsSection({
  query,
  selectedId,
  selectedIdPrefix,
  initialPlayer,
}: {
  query: string;
  selectedId: string;
  selectedIdPrefix: string;
  initialPlayer: Player | null;
}) {
  const hasQuery = query.length > 0;
  const hasSelectedId = selectedId.length > 0 || selectedIdPrefix.length > 0;
  const shouldExpandDetailByDefault = hasSelectedId;

  let exactMatch: Awaited<ReturnType<typeof playerService.searchPlayers>>[number] | null = null;
  let candidates: Awaited<ReturnType<typeof playerService.searchPlayers>> = [];
  let detailSummary = getEmptyPlayerDetailSummary();
  let detailSummaryLoaded = false;

  if (hasSelectedId) {
    exactMatch = await resolveSelectedPlayer(selectedId, selectedIdPrefix, query, initialPlayer);
  } else if (hasQuery) {
    const results = await playerService.searchPlayers(query);
    const exact = results.find((player) => isExactPlayerSearchMatch(player, query)) || null;
    exactMatch = exact;
    candidates = exact ? results.filter((player) => player.id !== exact.id) : results;
  }

  if (exactMatch) {
    const fullPrecomputed = getPrecomputedFullPlayerDetailSummary(exactMatch);
    if (fullPrecomputed) {
      detailSummary = fullPrecomputed;
      detailSummaryLoaded = true;
    } else {
      detailSummary = getPrecomputedPlayerDetailSummary(exactMatch);
    }
  }

  if (exactMatch && shouldExpandDetailByDefault && !detailSummaryLoaded) {
    detailSummary = await buildPlayerDetailSummary(exactMatch);
    detailSummaryLoaded = true;
  }

  return (
    <div className="mt-4 space-y-4">
      {exactMatch ? (
        <div className="space-y-2">
          {candidates.length > 0 ? (
            <div className="flex justify-start">
              <span className="inline-flex items-center rounded-full border border-nzu-green/20 bg-nzu-green/[0.07] px-2.5 py-1 text-[0.72rem] font-semibold tracking-wide text-nzu-green">
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
            loadDetailSummaryOnMount={!shouldExpandDetailByDefault}
          />
        </div>
      ) : null}

      {!exactMatch && candidates.length > 0 ? (
        <div className="hosaga-card px-5 py-4">
          <p className="text-sm font-medium text-white/80">정확히 일치하는 선수는 없지만, 비슷한 이름의 선수를 찾았습니다.</p>
        </div>
      ) : null}

      {candidates.length > 0 ? (
        <div className="space-y-1.5">
          {candidates.slice(0, 8).map((player) => (
            <Link
              key={player.id}
              href={buildPlayerHref(player)}
              prefetch={false}
              className="group flex items-center justify-between gap-3 rounded-xl border border-white/8 bg-card px-4 py-3 transition-colors hover:border-nzu-green/24 hover:bg-nzu-green/[0.05]"
            >
              <div className="min-w-0">
                <p className="text-sm font-semibold text-white transition-colors group-hover:text-nzu-green">{player.name}</p>
                <p className="mt-0.5 truncate text-xs font-medium text-white/45">
                  {[getUniversityLabel(player.university), getTierLabel(player.tier), normalizeRaceValue(player.race)].join(" · ")}
                </p>
              </div>
              <span className="shrink-0 text-xs font-semibold text-nzu-green/70 transition-colors group-hover:text-nzu-green">선수 보기 →</span>
            </Link>
          ))}
        </div>
      ) : null}

      {!exactMatch && hasSelectedId ? (
        <div className="rounded-xl border border-dashed border-white/10 px-5 py-6 text-center text-sm font-medium text-white/40">
          선택한 선수 정보를 찾지 못했습니다.
        </div>
      ) : null}

      {!exactMatch && !hasSelectedId && candidates.length === 0 ? (
        <div className="rounded-xl border border-dashed border-white/10 px-5 py-6 text-center text-sm font-medium text-white/40">
          검색 결과가 없습니다.
        </div>
      ) : null}
    </div>
  );
}

function ResultsLoadingState({ query }: { query: string }) {
  return (
    <div className="mt-4 space-y-4">
      <div className="flex items-center gap-3 rounded-2xl border border-white/8 bg-white/[0.025] px-5 py-4">
        <div className="h-3.5 w-3.5 shrink-0 animate-spin rounded-full border-2 border-white/10 border-t-nzu-green" />
        <span className="text-sm font-medium text-white/45">
          {query ? `"${query}" 검색 중...` : "선수 정보를 불러오는 중..."}
        </span>
      </div>
      <div className="rounded-2xl border border-white/8 bg-white/[0.025] p-5">
        <div className="grid gap-5 md:grid-cols-[124px_minmax(0,1fr)_240px]">
          <Skeleton className="h-[124px] w-full rounded-xl" />
          <div className="space-y-3 py-1">
            <Skeleton className="h-3 w-14" />
            <Skeleton className="h-7 w-48" />
            <div className="flex gap-2 pt-1">
              <Skeleton className="h-5 w-14 rounded-full" />
              <Skeleton className="h-5 w-20 rounded-full" />
              <Skeleton className="h-5 w-16 rounded-full" />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-2">
            <Skeleton className="h-[72px] rounded-xl" />
            <Skeleton className="h-[72px] rounded-xl" />
            <Skeleton className="h-[72px] rounded-xl" />
            <Skeleton className="h-[72px] rounded-xl" />
          </div>
        </div>
      </div>
    </div>
  );
}

export function PlayerPageView({
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
  const normalizedQuery = String(query || "").trim();
  const normalizedId = String(selectedId || "").trim();
  const normalizedIdPrefix = String(selectedIdPrefix || "").trim();
  const hasQuery = normalizedQuery.length > 0;
  const hasSelectedId = normalizedId.length > 0 || normalizedIdPrefix.length > 0;

  const initialSearchValue = normalizedQuery || initialPlayer?.name || "";

  return (
    <main className="min-h-[calc(100vh-4rem)] bg-background px-4 py-4 text-foreground md:px-8 xl:px-10">
      <div className="mx-auto flex max-w-[96rem] flex-col items-center pt-4 md:pt-5">
        <section className="w-full max-w-6xl overflow-hidden rounded-2xl border border-white/8 bg-card px-5 py-4 shadow-[0_8px_32px_rgba(0,0,0,0.28)] md:overflow-visible md:px-7 md:py-5 xl:max-w-[84rem] xl:px-8">
          <div className="mb-4">
            <Link href="/tier" prefetch={false} className="inline-flex items-center gap-2 text-[0.78rem] font-medium text-white/40 transition-colors hover:text-nzu-green">
              <span aria-hidden>←</span>
              <span>티어표로 돌아가기</span>
            </Link>
          </div>

          <div className="text-center">
            <h1 className="text-[1.9rem] font-bold tracking-tight text-white md:text-[2.4rem] xl:text-[2.7rem]">
              선수 <span className="text-nzu-green">검색</span>
            </h1>
            <p className="mx-auto mt-2 max-w-2xl text-sm font-medium text-white/50 md:text-[0.95rem]">
              선수 이름으로 검색하면 통산 기록과 최근 흐름, 종족전 요약, 주요 맵 지표를 한 번에 확인할 수 있습니다.
            </p>
          </div>

          <PlayerSearchForm initialQuery={initialSearchValue} />

          {hasQuery || hasSelectedId ? (
            <Suspense fallback={<ResultsLoadingState query={normalizedQuery} />}>
              <PlayerResultsSection
                query={normalizedQuery}
                selectedId={normalizedId}
                selectedIdPrefix={normalizedIdPrefix}
                initialPlayer={initialPlayer}
              />
            </Suspense>
          ) : null}
        </section>
      </div>
    </main>
  );
}
