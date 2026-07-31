"use client";

import Image from "next/image";
import Link from "next/link";
import { useEffect, useRef, useState } from "react";

import { RaceTag, TierBadge, type Race } from "@/components/ui/nzu-badges";
import type { PlayerDetailSummary } from "@/lib/player-detail-summary";
import type { Player } from "@/lib/player-service";
import type {
  MapSummary,
  RaceMapSummary,
  RaceSummary,
  RecentLog,
  RecentSummary,
  SpawnPartnerSummary,
} from "@/lib/player-matchup-summary";
import { normalizeRaceValue } from "@/lib/player-matchup-summary";
import { normalizeSoopImageUrl, resolveSoopChannelImageUrl, resolveSoopChannelUrl, resolveSoopWatchUrl } from "@/lib/soop";
import { getUniversityLabel } from "@/lib/university-config";
import { cn, normalizeTier } from "@/lib/utils";

type Props = {
  player: Player;
  raceSummaries: RaceSummary[];
  strongestMap: MapSummary | null;
  weakestMap: MapSummary | null;
  raceBestMaps: RaceMapSummary[];
  spawnPartner: SpawnPartnerSummary;
  recentLogs: RecentLog[];
  recentSummary: RecentSummary;
  defaultExpanded?: boolean;
  detailSummaryLoaded?: boolean;
  detailSummaryEndpoint?: string;
  loadDetailSummaryOnMount?: boolean;
};

// eslint-disable-next-line @typescript-eslint/no-unused-vars
function formatLiveElapsed(value: string | null | undefined) {
  const raw = String(value || "").trim();
  if (!raw) return null;
  const startedAt = new Date(raw.replace(" ", "T"));
  if (Number.isNaN(startedAt.getTime())) return null;
  const diffMs = Date.now() - startedAt.getTime();
  if (diffMs < 0) return null;
  const hours = Math.floor(diffMs / (60 * 60 * 1000));
  if (hours < 24) return `${hours}시간 전`;
  const days = Math.floor(hours / 24);
  return `${days}일 전`;
}

export default function PlayerSearchResult({ defaultExpanded = false, ...props }: Props) {
  return <PlayerSearchResultInner key={`${props.player.id}:${props.player.live_thumbnail_url || ""}:${props.recentLogs.length}:${props.detailSummaryLoaded ? "loaded" : "lazy"}:${props.loadDetailSummaryOnMount ? "auto" : "manual"}:${defaultExpanded ? "1" : "0"}`} defaultExpanded={defaultExpanded} {...props} />;
}

function PlayerSearchResultInner({
  player,
  raceSummaries: initialRaceSummaries,
  strongestMap: initialStrongestMap,
  weakestMap: initialWeakestMap,
  raceBestMaps: initialRaceBestMaps,
  spawnPartner: initialSpawnPartner,
  recentLogs: initialRecentLogs,
  recentSummary: initialRecentSummary,
  defaultExpanded = false,
  detailSummaryLoaded = false,
  detailSummaryEndpoint,
  loadDetailSummaryOnMount = false,
}: Props) {
  type MatchFilter = "recent90" | "all";
  const [isExpanded, setIsExpanded] = useState(defaultExpanded);
  const [matchFilter, setMatchFilter] = useState<MatchFilter>("recent90");
  const [categoryFilter, setCategoryFilter] = useState("");
  const [excludeMini, setExcludeMini] = useState(false);
  const [filterPage, setFilterPage] = useState(1);
  const [filteredData, setFilteredData] = useState<MatchHistoryApiResponse | null>(null);
  const [isFilterLoading, setIsFilterLoading] = useState(defaultExpanded);
  const [failedThumbnailSrc, setFailedThumbnailSrc] = useState<string | null>(null);
  const [detailSummary, setDetailSummary] = useState<PlayerDetailSummary>({
    raceSummaries: initialRaceSummaries,
    strongestMap: initialStrongestMap,
    weakestMap: initialWeakestMap,
    raceBestMaps: initialRaceBestMaps,
    spawnPartner: initialSpawnPartner,
    recentLogs: initialRecentLogs,
    recentSummary: initialRecentSummary,
  });
  const [isDetailSummaryLoaded, setIsDetailSummaryLoaded] = useState(detailSummaryLoaded);
  const requestedDetailSummaryRef = useRef(detailSummaryLoaded);

  useEffect(() => {
    if (!(isExpanded || loadDetailSummaryOnMount) || isDetailSummaryLoaded || requestedDetailSummaryRef.current || !detailSummaryEndpoint) {
      return;
    }

    const controller = new AbortController();
    let cancelled = false;
    requestedDetailSummaryRef.current = true;

    fetch(detailSummaryEndpoint, {
      headers: { Accept: "application/json" },
      signal: controller.signal,
    })
      .then((response) => {
        if (!response.ok) throw new Error("Failed to load player detail summary");
        return response.json() as Promise<PlayerDetailSummary>;
      })
      .then((summary) => {
        if (cancelled) return;
        setDetailSummary(summary);
        setIsDetailSummaryLoaded(true);
      })
      .catch((error: unknown) => {
        if (error instanceof Error && error.name === "AbortError") return;
        if (!cancelled) requestedDetailSummaryRef.current = false;
      });

    return () => {
      cancelled = true;
      controller.abort();
    };
  }, [detailSummaryEndpoint, isDetailSummaryLoaded, isExpanded, loadDetailSummaryOnMount]);

  useEffect(() => {
    if (!isExpanded) return;

    let cancelled = false;

    const params = new URLSearchParams({ page: String(filterPage) });
    if (matchFilter === "recent90") {
      params.set("filter", "recent90");
    } else if (matchFilter !== "all") {
      params.set("year", matchFilter);
    }
    if (categoryFilter) params.set("category", categoryFilter);
    if (excludeMini) params.set("excludeMini", "1");

    fetch(`/api/player/${encodeURIComponent(player.id)}/matches?${params}`)
      .then((res) => {
        if (!res.ok) throw new Error("failed");
        return res.json() as Promise<MatchHistoryApiResponse>;
      })
      .then((json) => {
        if (cancelled) return;
        setFilteredData(json);
        setIsFilterLoading(false);
      })
      .catch(() => {
        if (!cancelled) setIsFilterLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [player.id, isExpanded, matchFilter, categoryFilter, excludeMini, filterPage]);

  const normTier = normalizeTier(player.tier);
  const isElite = ["갓", "킹"].includes(normTier);
  const themeColor = isElite ? "rgba(255, 215, 0, 0.28)" : "rgba(0, 255, 163, 0.22)";
  const {
    raceSummaries,
    spawnPartner,
    recentLogs,
    recentSummary,
  } = detailSummary;
  const recentForm = recentSummary.form;
  const displayRaceSummaries = filteredData?.stats?.raceSummaries ?? raceSummaries;
  // recentLogs는 최신순 → 렌더는 과거→최신이므로 뒤집는다
  const recentLogs10 = recentLogs.slice(0, 10).reverse();
  const recentForm10 = recentLogs10.map((log) => log.result);
  const form10Wins = recentForm10.filter((r) => r === "승").length;
  const form10Losses = recentForm10.length - form10Wins;
  const form10WinRate = recentForm10.length > 0 ? Math.round((form10Wins / recentForm10.length) * 100) : null;

  const importantStats = filteredData?.importantStats;
  const importantForm = importantStats?.form ?? [];
  const importantFormWins = importantForm.filter((r) => r === "승").length;
  const importantFormLosses = importantForm.length - importantFormWins;
  const importantFormWinRate = importantForm.length > 0 ? Math.round((importantFormWins / importantForm.length) * 100) : null;
  const importantTotal = importantStats ? importantStats.wins + importantStats.losses : 0;
  const channelUrl = resolveSoopChannelUrl(player);
  const liveWatchUrl = player.is_live ? resolveSoopWatchUrl(player) : null;
  const liveThumbnailUrl = normalizeSoopImageUrl(player.live_thumbnail_url) || "";
  const canShowLiveThumbnail = Boolean(liveThumbnailUrl) && failedThumbnailSrc !== liveThumbnailUrl;
  const profileImageUrl = resolveSoopChannelImageUrl(player) || player.photo_url || "/placeholder-player.svg";
  const profileImageSizes = "124px";
  const universityLabel = getUniversityLabel(player.university);

  function handleToggleExpanded() {
    const next = !isExpanded;
    setIsExpanded(next);
    setIsFilterLoading(next);
    if (!next) setFilteredData(null);
  }

  return (
    <div className="overflow-hidden rounded-2xl border border-white/8 bg-white/[0.03] px-5 py-5 md:overflow-visible md:px-7 md:py-6 xl:px-8 xl:py-7">
      <div className="grid gap-6 md:grid-cols-[124px_1fr]">

        {/* ── 프로필 사진 컬럼 ── */}
        <div className="md:row-span-2">
          <div className="group relative w-[124px] shrink-0">
            <div className="relative h-[124px] w-[124px] overflow-hidden rounded-2xl border border-white/10 bg-black/30">
              {liveWatchUrl ? (
                <Link href={liveWatchUrl} target="_blank" rel="noreferrer" className="block h-full w-full">
                  <Image src={profileImageUrl} alt={player.name} fill sizes={profileImageSizes} unoptimized className="object-cover object-top transition-transform duration-300 hover:scale-105" />
                </Link>
              ) : (
                <Image src={profileImageUrl} alt={player.name} fill sizes={profileImageSizes} unoptimized className="object-cover object-top" />
              )}
              {player.is_live ? (
                <div className="absolute right-2 top-2 inline-flex items-center rounded-full bg-red-600 px-2 py-0.5 text-[10px] font-black tracking-tight text-white shadow-lg">
                  LIVE
                </div>
              ) : null}
            </div>

            {player.is_live ? (
              <div className="pointer-events-none absolute bottom-[calc(100%+0.9rem)] left-[-1rem] z-20 hidden w-[29rem] overflow-hidden rounded-2xl border border-white/10 bg-[#061015] opacity-0 shadow-[0_20px_45px_rgba(0,0,0,0.38)] transition-all duration-200 md:block md:translate-y-2 md:scale-[0.98] group-hover:translate-y-0 group-hover:scale-100 group-hover:opacity-100">
                <div className="relative aspect-[16/9] w-full bg-[linear-gradient(180deg,rgba(8,14,18,0.55),rgba(3,6,8,0.92))]">
                  {canShowLiveThumbnail ? (
                    <Image
                      src={liveThumbnailUrl}
                      alt={`${player.name} live preview`}
                      fill
                      unoptimized
                      className="object-cover"
                      onError={() => setFailedThumbnailSrc(liveThumbnailUrl)}
                    />
                  ) : null}
                  <div className="absolute inset-0 bg-gradient-to-t from-black/90 via-black/30 to-transparent" />
                  <div className="absolute left-4 top-4 flex items-center gap-2">
                    <div className="inline-flex items-center rounded-full bg-red-600 px-2.5 py-0.5 text-[10px] font-black tracking-tight text-white shadow-lg">
                      LIVE
                    </div>
                    {player.live_viewers ? (
                      <div className="inline-flex items-center rounded-full border border-white/12 bg-black/45 px-2.5 py-0.5 text-[11px] font-semibold tracking-tight text-white">
                        {player.live_viewers}명 시청 중
                      </div>
                    ) : null}
                  </div>
                  <div className="absolute inset-x-0 bottom-0 p-4">
                    <p className="line-clamp-2 text-base font-bold leading-snug text-white">
                      {player.broadcast_title || `${player.name} 방송 중`}
                    </p>
                    <div className="mt-1.5 text-sm font-medium tracking-tight text-white/65">
                      <span className="truncate">{player.name}</span>
                    </div>
                  </div>
                </div>
              </div>
            ) : null}

            <div className="mt-4 text-center">
              <h2 className="text-xl font-bold tracking-tight text-white md:text-2xl">{player.name}</h2>
              {player.nickname ? <p className="mt-1 text-sm font-medium text-white/45">{player.nickname}</p> : null}
              {channelUrl ? (
                <a
                  href={channelUrl}
                  target="_blank"
                  rel="noreferrer"
                  className="mt-3 inline-flex h-10 w-full items-center justify-center rounded-xl border border-sky-400/22 bg-sky-400/[0.09] px-3 text-sm font-semibold tracking-tight text-sky-300 transition-all hover:border-sky-300/38 hover:bg-sky-400/[0.16] hover:text-white"
                >
                  방송 채널 보기
                </a>
              ) : (
                <button
                  type="button"
                  disabled
                  aria-disabled="true"
                  className="mt-3 inline-flex h-10 w-full items-center justify-center rounded-xl border border-white/10 bg-white/[0.04] px-3 text-sm font-medium tracking-tight text-white/38"
                >
                  방송 채널 보기
                </button>
              )}
            </div>
          </div>
        </div>

        {/* ── 정보 패널 행 (학교/티어/종족/최다 상대 + 상세 버튼) ── */}
        <div className="flex items-stretch gap-6">
          <div className="grid flex-1 items-stretch gap-3 sm:grid-cols-2 md:grid-cols-4">
            <StatPanel label="학교">{universityLabel}</StatPanel>
            <StatPanel label="티어">
              <TierBadge tier={player.tier || "미정"} size="md" />
            </StatPanel>
            <StatPanel label="종족">
              <RaceTag race={normalizeRaceValue(player.race)} size="md" />
            </StatPanel>
            <StatPanel label="최다 상대">
              {spawnPartner ? (
                <div className="min-w-0">
                  <div className="flex items-center gap-1.5">
                    <RaceTag race={spawnPartner.race} size="xs" />
                    <span className="truncate text-base font-bold text-white">{spawnPartner.name}</span>
                  </div>
                  <p className="mt-0.5 text-[11px] font-medium text-white/45 tabular-nums">
                    {spawnPartner.matches}전 · {spawnPartner.wins}승 {spawnPartner.losses}패
                  </p>
                </div>
              ) : (
                <span className="text-white/35">없음</span>
              )}
            </StatPanel>
          </div>
          <button
            type="button"
            onClick={handleToggleExpanded}
            className="inline-flex w-[150px] shrink-0 items-center justify-center rounded-xl border border-nzu-green/20 bg-nzu-green/[0.07] px-4 text-nzu-green transition-all hover:border-nzu-green/38 hover:bg-nzu-green/[0.12] xl:w-[160px]"
          >
            <span className="text-lg font-semibold tracking-tight">
              {isExpanded ? "상세 닫기" : "상세 리포트"}
            </span>
          </button>
        </div>

        {/* ── Row 2: 지표 카드 + 최근 5경기 ── */}
        <div className="flex min-w-0 items-stretch gap-6">
          <div className="min-w-0 flex-1">
            <div className="mb-3 flex flex-wrap items-center gap-x-5 gap-y-1">
              <span className="ui-label text-nzu-green">통산 기준: 2025.01.01 ~ 현재</span>
              <span className="ui-label text-red-400">최근 기준: 최근 3개월 경기</span>
            </div>
            <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
              <MetricCard tone="green" label="통산 승률" value={player.win_rate != null ? `${player.win_rate}%` : "-"} />
              <MetricCard tone="green" label="통산 전적" value={`${player.total_wins ?? 0}승 / ${player.total_losses ?? 0}패`} />
              <MetricCard tone="red" label="최근 승률" value={recentSummary.winRate} />
              <MetricCard tone="red" label="최근 전적" value={`${recentSummary.wins}승 / ${recentSummary.losses}패`} />
            </div>
          </div>
          <div className="flex w-[220px] shrink-0 flex-col xl:w-[240px]">
            <p className="ui-label mb-3">최근 5경기 흐름</p>
            <div className="flex flex-1 flex-col rounded-xl border border-white/8 bg-white/[0.03] px-3 py-3.5 xl:px-4 xl:py-4">
              <div className="flex items-center justify-between text-xs font-medium text-white/38">
                <span>과거</span>
                <span>→</span>
                <span>최근</span>
              </div>
              {recentForm.length ? (
                <div className="mt-2.5 grid grid-cols-5 items-end gap-1.5">
                  {recentForm.map((result, index) => (
                    <span
                      key={`${result}-${index}`}
                      className={cn(
                        "inline-flex w-full items-center justify-center rounded-lg border text-sm font-semibold",
                        index < 2 ? "h-8" : index === 2 ? "h-9" : index === 3 ? "h-10" : "h-12",
                        result === "승" ? "border-nzu-green/25 bg-nzu-green/[0.1] text-nzu-green" : "border-red-400/25 bg-red-400/[0.1] text-red-300"
                      )}
                    >
                      {result}
                    </span>
                  ))}
                </div>
              ) : (
                <div className="mt-2 flex flex-1 items-center justify-center rounded-lg border border-dashed border-white/8 bg-black/10 px-3 py-4 text-sm font-medium text-white/35">
                  최근 경기 기록이 없습니다
                </div>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* ── 상세 리포트 (펼쳤을 때) ── */}
      {isExpanded ? (
        <section className="relative mt-6 overflow-hidden rounded-2xl border border-white/8 bg-[#0a0f0d] px-4 py-5 shadow-[0_18px_42px_rgba(0,0,0,0.24)] md:px-5 md:py-6 xl:px-6 xl:py-7">
          <div className="pointer-events-none absolute -right-16 -top-16 h-[180px] w-[180px] rounded-full blur-[90px] opacity-20" style={{ backgroundColor: themeColor }} />
          <div className="relative space-y-6">

            {/* ── 분석 기간 필터 ── */}
            <div className="flex flex-wrap items-center justify-center gap-2">
              <span className="shrink-0 text-[11px] font-medium text-white/30">분석 기간</span>
              <div className="flex flex-wrap items-center gap-1.5">
                {(["recent90", "all"] as const).map((f) => (
                  <button
                    key={f}
                    type="button"
                    onClick={() => {
                      if (matchFilter === f && filterPage === 1) return;
                      setMatchFilter(f);
                      setFilterPage(1);
                      setIsFilterLoading(true);
                    }}
                    className={cn(
                      "rounded-lg px-4 py-2 text-sm font-semibold transition-all",
                      matchFilter === f
                        ? "border border-nzu-green/35 bg-nzu-green/[0.12] text-nzu-green"
                        : "border border-white/8 bg-white/[0.02] text-white/40 hover:text-white/65 hover:border-white/14"
                    )}
                  >
                    {f === "recent90" ? "최근 90일" : "전체 기간"}
                  </button>
                ))}
              </div>
            </div>

            {/* ── 전체 vs ⭐중요경기 좌우 대칭 비교 (승패 카드 + 종족별 승률) ── */}
            <div className="grid gap-6 md:grid-cols-2">
              <Section title="전체">
                <PeriodStatCards
                  isLoading={isFilterLoading}
                  wins={filteredData?.stats.wins ?? recentSummary.wins}
                  losses={filteredData?.stats.losses ?? recentSummary.losses}
                  winRate={filteredData?.stats.winRate ?? recentSummary.winRate}
                />
                <RaceStatList summaries={displayRaceSummaries} isLoading={isFilterLoading} />
              </Section>

              {/* 중요경기가 0경기여도 열은 남긴다 — 사라지면 왼쪽이 전체 폭으로 튄다 */}
              <div className="md:border-l md:border-white/8 md:pl-6">
                <Section
                  titleClassName="flex min-w-0 flex-1 flex-wrap items-center gap-x-3 gap-y-1.5"
                  title={
                    <>
                      <span className="shrink-0">⭐ 중요경기</span>
                      <label className="inline-flex cursor-pointer items-center gap-1.5 text-[11px] font-semibold text-white/40 transition-colors hover:text-white/65">
                        <input
                          type="checkbox"
                          checked={excludeMini}
                          onChange={(e) => {
                            setExcludeMini(e.target.checked);
                            setFilterPage(1);
                            setIsFilterLoading(true);
                          }}
                          className="h-3 w-3 accent-nzu-green"
                        />
                        미니대전 제외
                      </label>
                    </>
                  }
                >
                  {importantStats && importantTotal > 0 ? (
                    <>
                      <PeriodStatCards
                        isLoading={isFilterLoading}
                        wins={importantStats.wins}
                        losses={importantStats.losses}
                        winRate={importantStats.winRate}
                      />
                      {/* 표본이 얇아도 승률·전적은 그대로 노출한다(사용자 결정). 신뢰도는 막대 투명도로만 알린다 */}
                      <RaceStatList summaries={importantStats.raceSummaries} isLoading={isFilterLoading} dimThinBars />
                    </>
                  ) : (
                    <CompactRow value={isFilterLoading ? "불러오는 중..." : "중요경기 기록이 없습니다"} />
                  )}
                </Section>
              </div>
            </div>

            {/* 위 비교 그리드와 같은 열 경계 — 한쪽이 비어도 열은 유지한다 */}
            <div className="grid gap-6 md:grid-cols-2">
              <Section title="최근 10경기 흐름">
                {recentForm10.length > 0 ? (
                  <FormRow
                    form={recentForm10}
                    wins={form10Wins}
                    losses={form10Losses}
                    winRate={form10WinRate}
                  />
                ) : (
                  <CompactRow value="최근 경기 기록이 없습니다" />
                )}
              </Section>

              <div className="md:border-l md:border-white/8 md:pl-6">
                <Section title="⭐ 최근 중요경기">
                  {importantForm.length > 0 ? (
                    <FormRow
                      form={importantForm}
                      wins={importantFormWins}
                      losses={importantFormLosses}
                      winRate={importantFormWinRate}
                    />
                  ) : (
                    <CompactRow value={isFilterLoading ? "불러오는 중..." : "중요경기 기록이 없습니다"} />
                  )}
                </Section>
              </div>
            </div>

            <Section
              titleClassName="flex min-w-0 flex-1 flex-wrap items-center gap-x-3 gap-y-1.5"
              title={
                <>
                  <span className="shrink-0">경기 기록</span>
                  <span className="flex flex-wrap items-center gap-1">
                    {CATEGORY_FILTERS.map((c) => (
                      <button
                        key={c.value || "all"}
                        type="button"
                        onClick={() => {
                          if (categoryFilter === c.value && filterPage === 1) return;
                          setCategoryFilter(c.value);
                          setFilterPage(1);
                          setIsFilterLoading(true);
                        }}
                        className={cn(
                          "rounded-lg px-2.5 py-1 text-[11px] font-semibold transition-all",
                          categoryFilter === c.value
                            ? "border border-nzu-green/35 bg-nzu-green/[0.12] text-nzu-green"
                            : "border border-white/8 bg-white/[0.02] text-white/40 hover:text-white/65 hover:border-white/14"
                        )}
                      >
                        {c.label}
                      </button>
                    ))}
                  </span>
                </>
              }
            >
              {matchFilter === "recent90" && !categoryFilter && !filteredData ? (
                <div className="grid gap-1.5">
                  {recentLogs.length ? (
                    recentLogs.map((log) => <MatchLogRow key={log.id} log={log} />)
                  ) : (
                    <CompactRow value="기록 없음" />
                  )}
                </div>
              ) : filteredData?.matches.length ? (
                /* 데이터가 로딩보다 우선한다 — 필터를 바꿔도 이전 목록을 흐리게 유지할 뿐 스피너로 갈아치우지 않는다.
                   순서를 뒤집으면(로딩 우선) 칩을 누를 때마다 목록이 사라졌다 나타나며 깜빡인다. */
                <div className={cn("space-y-1.5 transition-opacity", isFilterLoading ? "opacity-40" : "opacity-100")}>
                  <div className="grid gap-1.5">
                    {filteredData.matches.map((log) => (
                      <MatchLogRow key={log.id} log={log} />
                    ))}
                  </div>
                  {filteredData.totalPages > 1 ? (
                    <div className="flex items-center justify-center gap-3 pt-2">
                      <button
                        type="button"
                        disabled={filteredData.page <= 1}
                        onClick={() => { setFilterPage((p) => Math.max(1, p - 1)); setIsFilterLoading(true); }}
                        className="rounded-xl border border-white/10 bg-white/[0.03] px-4 py-2 text-sm font-semibold text-white/55 transition-all hover:border-white/18 hover:bg-white/[0.07] hover:text-white disabled:pointer-events-none disabled:opacity-30"
                      >
                        ← 이전
                      </button>
                      <span className="text-sm font-medium text-white/45 tabular-nums">
                        {filteredData.page} / {filteredData.totalPages}
                      </span>
                      <button
                        type="button"
                        disabled={filteredData.page >= filteredData.totalPages}
                        onClick={() => { setFilterPage((p) => Math.min(filteredData.totalPages, p + 1)); setIsFilterLoading(true); }}
                        className="rounded-xl border border-white/10 bg-white/[0.03] px-4 py-2 text-sm font-semibold text-white/55 transition-all hover:border-white/18 hover:bg-white/[0.07] hover:text-white disabled:pointer-events-none disabled:opacity-30"
                      >
                        다음 →
                      </button>
                    </div>
                  ) : null}
                </div>
              ) : isFilterLoading ? (
                <div className="flex items-center gap-2.5 rounded-xl border border-white/7 bg-white/[0.02] px-4 py-4">
                  <div className="h-3.5 w-3.5 shrink-0 animate-spin rounded-full border-2 border-white/10 border-t-nzu-green" />
                  <span className="text-sm font-medium text-white/38">경기 기록을 불러오는 중...</span>
                </div>
              ) : (
                <CompactRow value="해당 조건의 기록이 없습니다" />
              )}
            </Section>
          </div>
        </section>
      ) : null}
    </div>
  );
}

function Section({
  title,
  children,
  titleClassName,
}: {
  title: React.ReactNode;
  children: React.ReactNode;
  titleClassName?: string;
}) {
  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2.5">
        <div className="h-[1.1rem] w-[3px] rounded-full bg-nzu-green/50" />
        <p className={cn("text-[13px] font-bold tracking-wide text-white/65", titleClassName)}>{title}</p>
      </div>
      {children}
    </div>
  );
}

function CompactRow({
  label,
  leading,
  value,
}: {
  label?: string;
  leading?: React.ReactNode;
  value: string;
}) {
  return (
    <div className="flex items-center gap-3 rounded-xl border border-white/7 bg-white/[0.02] px-4 py-3 text-sm font-medium text-white/65">
      {leading ? <span className="shrink-0">{leading}</span> : null}
      {label ? <span className="shrink-0 text-white/42">{label}</span> : null}
      <span className="min-w-0 truncate">{value}</span>
    </div>
  );
}

function StatPanel({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-col justify-center rounded-xl border border-white/8 bg-white/[0.045] px-4 py-4 md:px-5 md:py-[18px]">
      <p className="text-xs font-medium uppercase tracking-widest text-white/38">{label}</p>
      <div className="mt-2 text-[1.35rem] font-bold tracking-tight text-white md:text-[1.5rem]">{children}</div>
    </div>
  );
}

function MetricCard({ tone, label, value }: { tone: "green" | "red"; label: string; value: string }) {
  const toneClass = tone === "green" ? "border-nzu-green/18 bg-nzu-green/[0.07]" : "border-red-400/18 bg-red-400/[0.06]";
  const labelClass = tone === "green" ? "text-nzu-green/72" : "text-red-300/78";
  const compactValue = value === "기록 없음" ? "없음" : value;
  const isRecordCard = label.includes("전적");
  const recordLines = compactValue.split(" / ").filter(Boolean);
  const isEmptyValue = compactValue === "없음";

  return (
    <div className={cn("rounded-xl border px-3 py-4 text-center md:px-4 md:py-5", toneClass)}>
      <p className={cn("text-[11px] font-medium uppercase tracking-widest", labelClass)}>{label}</p>
      {isRecordCard && recordLines.length > 1 ? (
        <div className="mt-2 space-y-0.5">
          {recordLines.map((line) => (
            <p key={line} className="text-2xl font-extrabold tracking-tight text-white md:text-[1.6rem] xl:text-[1.7rem]">
              {line}
            </p>
          ))}
        </div>
      ) : isEmptyValue ? (
        <p className="mt-2.5 text-2xl font-bold tracking-tight text-white/38">없음</p>
      ) : (
        <p className="mt-2 text-3xl font-extrabold tracking-tight text-white md:text-[2rem] xl:text-[2.1rem]">{compactValue}</p>
      )}
    </div>
  );
}

const RACE_TONE: Record<Race, { border: string; bar: string; text: string }> = {
  T: { border: "border-terran/20 bg-terran/[0.04]", bar: "bg-terran", text: "text-terran" },
  Z: { border: "border-zerg/20 bg-zerg/[0.04]", bar: "bg-zerg", text: "text-zerg" },
  P: { border: "border-protoss/20 bg-protoss/[0.04]", bar: "bg-protoss", text: "text-protoss" },
};

function FormRow({
  form,
  wins,
  losses,
  winRate,
}: {
  form: Array<"승" | "패">;
  wins: number;
  losses: number;
  winRate: number | null;
}) {
  return (
    <div className="rounded-xl border border-white/8 bg-white/[0.03] px-4 py-4">
      <div className="flex flex-wrap items-center gap-1">
        <span className="mr-1 text-[11px] font-medium text-white/30">과거</span>
        {form.map((result, index) => {
          const opacity = 0.35 + (index / Math.max(form.length - 1, 1)) * 0.65;
          return (
            <span
              key={index}
              style={{ opacity }}
              className={cn(
                "inline-flex h-7 w-7 items-center justify-center rounded-lg text-sm font-semibold",
                result === "승"
                  ? "border border-nzu-green/25 bg-nzu-green/[0.12] text-nzu-green"
                  : "border border-red-400/25 bg-red-400/[0.1] text-red-300"
              )}
            >
              {result}
            </span>
          );
        })}
        <span className="ml-1 text-[11px] font-medium text-white/30">최신</span>
        <div className="ml-auto flex items-center gap-3 pl-2">
          <span className="text-sm font-semibold text-white/70">
            {wins}승 {losses}패
          </span>
          {winRate !== null ? (
            <span className={cn(
              "rounded-full border px-2.5 py-0.5 text-xs font-bold tabular-nums",
              winRate >= 50
                ? "border-nzu-green/25 bg-nzu-green/[0.1] text-nzu-green"
                : "border-red-400/25 bg-red-400/[0.1] text-red-300"
            )}>
              {winRate}%
            </span>
          ) : null}
        </div>
      </div>
    </div>
  );
}

const EMPTY_RACE_SUMMARIES: RaceSummary[] = [
  { race: "T", matches: 0, wins: 0, losses: 0, winRate: "0.0%", hasRecord: false },
  { race: "Z", matches: 0, wins: 0, losses: 0, winRate: "0.0%", hasRecord: false },
  { race: "P", matches: 0, wins: 0, losses: 0, winRate: "0.0%", hasRecord: false },
];

function RaceStatList({
  summaries,
  isLoading,
  dimThinBars = false,
}: {
  summaries: RaceSummary[];
  isLoading: boolean;
  dimThinBars?: boolean;
}) {
  const rows = summaries.some((item) => item.hasRecord) ? summaries : EMPTY_RACE_SUMMARIES;

  return (
    <div className={cn("space-y-2 transition-opacity", isLoading ? "opacity-40" : "opacity-100")}>
      {rows.map((item) => (
        <RaceStatRow
          key={item.race}
          race={item.race}
          hasRecord={item.hasRecord}
          wins={item.wins}
          losses={item.losses}
          matches={item.matches}
          winRate={item.winRate}
          dim={dimThinBars && item.matches < 5}
        />
      ))}
    </div>
  );
}

function RaceStatRow({
  race,
  hasRecord,
  winRate,
  wins,
  losses,
  matches,
  dim = false,
}: {
  race: Race;
  hasRecord: boolean;
  winRate: string;
  wins: number;
  losses: number;
  matches: number;
  dim?: boolean;
}) {
  const winRateNum = hasRecord ? parseFloat(winRate) || 0 : 0;
  const toneStyle = RACE_TONE[race];

  return (
    <div className={cn("rounded-xl border px-4 py-3.5", toneStyle.border)}>
      <div className="flex items-center gap-3">
        <RaceTag race={race} size="xs" />
        <span className={cn("min-w-[3.5rem] text-xl font-extrabold tabular-nums tracking-tight", hasRecord ? toneStyle.text : "text-white/28")}>
          {hasRecord ? winRate : "—"}
        </span>
        <div className="ml-auto text-sm font-medium text-white/42 tabular-nums">
          {hasRecord ? `${matches}전 · ${wins}승 ${losses}패` : "기록 없음"}
        </div>
      </div>
      <div className="mt-2.5 h-1.5 w-full rounded-full bg-white/[0.06]">
        <div
          className={cn("h-1.5 rounded-full transition-all duration-500", hasRecord ? toneStyle.bar : "bg-white/10", dim && "opacity-40")}
          style={{ width: `${Math.min(winRateNum, 100)}%` }}
        />
      </div>
    </div>
  );
}

type MatchCategory = "mini" | "uni" | "tourney";

const CATEGORY_LABELS: Record<MatchCategory, string> = {
  mini: "미니대전",
  uni: "대학대전",
  tourney: "대회",
};

const CATEGORY_FILTERS: Array<{ value: string; label: string }> = [
  { value: "", label: "전체 경기" },
  { value: "important", label: "⭐ 중요 경기" },
  { value: "mini", label: CATEGORY_LABELS.mini },
  { value: "uni", label: CATEGORY_LABELS.uni },
  { value: "tourney", label: CATEGORY_LABELS.tourney },
];

type MatchHistoryApiItem = {
  id: string;
  result: "승" | "패";
  opponentName: string;
  opponentRace: Race;
  mapName: string;
  dateText: string;
  note?: string | null;
  category?: MatchCategory | null;
};

type MatchHistoryApiResponse = {
  matches: MatchHistoryApiItem[];
  total: number;
  page: number;
  totalPages: number;
  stats: {
    wins: number;
    losses: number;
    winRate: string;
    raceSummaries: Array<{
      race: Race;
      wins: number;
      losses: number;
      matches: number;
      winRate: string;
      hasRecord: boolean;
    }>;
  };
  // 경기 종류 칩과 무관하게 항상 중요경기 전체 기준 (분석 기간에만 반응)
  importantStats?: {
    wins: number;
    losses: number;
    winRate: string;
    raceSummaries: Array<{
      race: Race;
      wins: number;
      losses: number;
      matches: number;
      winRate: string;
      hasRecord: boolean;
    }>;
    form: Array<"승" | "패">; // 오래된 → 최신 순
    formFromDateText: string | null;
    formToDateText: string | null;
  };
};

function MatchLogRow({ log }: { log: MatchHistoryApiItem }) {
  return (
    <div className="flex items-center gap-2 rounded-xl border border-white/7 bg-white/[0.02] px-3 py-2 md:gap-2.5 md:px-4">
      <span
        className={cn(
          "inline-flex h-7 w-8 shrink-0 items-center justify-center rounded-lg text-sm font-semibold",
          log.result === "승" ? "border border-nzu-green/25 bg-nzu-green/[0.12] text-nzu-green" : "border border-red-400/25 bg-red-400/[0.1] text-red-300"
        )}
      >
        {log.result}
      </span>
      <RaceTag race={log.opponentRace} size="xs" />
      <span className="max-w-[45%] shrink-0 truncate text-[0.95rem] font-semibold text-white">{log.opponentName}</span>
      <span className="min-w-0 truncate text-sm font-medium text-white/45">{log.mapName}</span>
      {/* 분류별 라벨을 달지 않는다 — 바로 옆 비고에 이미 분류 근거 단어가 들어 있다(실측 8,873건 전부).
          별표는 "중요경기다"만 표시하고, 어떤 분류인지는 툴팁으로 남긴다. */}
      {log.category ? (
        <span
          className="shrink-0 text-[11px] leading-none"
          title={CATEGORY_LABELS[log.category]}
          aria-label={CATEGORY_LABELS[log.category]}
        >
          ⭐
        </span>
      ) : null}
      {log.note ? (
        <span className="min-w-0 flex-1 truncate text-sm font-medium text-white/50" title={log.note}>
          {log.note}
        </span>
      ) : null}
      <span className="ml-auto shrink-0 whitespace-nowrap text-xs font-medium text-white/32 tabular-nums">{log.dateText}</span>
    </div>
  );
}

function PeriodStatCards({
  isLoading,
  wins,
  losses,
  winRate,
}: {
  isLoading: boolean;
  wins: number | null;
  losses: number | null;
  winRate: string | null;
}) {
  const winRateNum = winRate ? parseFloat(winRate) : null;
  const isEmpty = wins === null && losses === null;

  return (
    <div className={cn("flex flex-wrap gap-2 transition-opacity", isLoading ? "opacity-40" : "opacity-100")}>
      <div className="inline-flex items-baseline gap-2.5 rounded-xl border border-nzu-green/15 bg-nzu-green/[0.06] px-4 py-2.5">
        <p className="text-sm font-bold text-nzu-green/70">승</p>
        <p className="text-3xl font-extrabold tabular-nums tracking-tight text-white">
          {isEmpty ? "—" : (wins ?? 0)}
        </p>
      </div>
      <div className="inline-flex items-baseline gap-2.5 rounded-xl border border-red-400/15 bg-red-400/[0.05] px-4 py-2.5">
        <p className="text-sm font-bold text-red-400/70">패</p>
        <p className="text-3xl font-extrabold tabular-nums tracking-tight text-white">
          {isEmpty ? "—" : (losses ?? 0)}
        </p>
      </div>
      <div className="inline-flex items-baseline gap-2.5 rounded-xl border border-white/8 bg-white/[0.03] px-4 py-2.5">
        <p className="text-sm font-bold text-white/50">승률</p>
        <p className={cn(
          "text-3xl font-extrabold tabular-nums tracking-tight",
          winRateNum === null ? "text-white/40" : winRateNum >= 50 ? "text-nzu-green" : "text-red-300"
        )}>
          {isEmpty ? "—" : (winRate ?? "—")}
        </p>
      </div>
    </div>
  );
}

