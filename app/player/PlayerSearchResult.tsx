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
  const [filterPage, setFilterPage] = useState(1);
  const [filteredData, setFilteredData] = useState<MatchHistoryApiResponse | null>(null);
  const [isFilterLoading, setIsFilterLoading] = useState(false);
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
    if (!isExpanded) {
      setFilteredData(null);
      setIsFilterLoading(false);
      return;
    }

    let cancelled = false;
    setIsFilterLoading(true);

    const params = new URLSearchParams({ page: String(filterPage) });
    if (matchFilter === "recent90") {
      params.set("filter", "recent90");
    } else if (matchFilter !== "all") {
      params.set("year", matchFilter);
    }

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
  }, [player.id, isExpanded, matchFilter, filterPage]);

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
  const hasRaceData = raceSummaries.some((item) => item.hasRecord);
  const displayRaceSummaries = filteredData?.stats?.raceSummaries ?? raceSummaries;
  const hasDisplayRaceData = displayRaceSummaries.some((item) => item.hasRecord);
  const recentForm10 = recentLogs.slice(0, 10).map((log) => log.result);
  const form10Wins = recentForm10.filter((r) => r === "승").length;
  const form10Losses = recentForm10.length - form10Wins;
  const form10WinRate = recentForm10.length > 0 ? Math.round((form10Wins / recentForm10.length) * 100) : null;
  const channelUrl = resolveSoopChannelUrl(player);
  const liveWatchUrl = player.is_live ? resolveSoopWatchUrl(player) : null;
  const liveThumbnailUrl = normalizeSoopImageUrl(player.live_thumbnail_url) || "";
  const canShowLiveThumbnail = Boolean(liveThumbnailUrl) && failedThumbnailSrc !== liveThumbnailUrl;
  const profileImageUrl = resolveSoopChannelImageUrl(player) || player.photo_url || "/placeholder-player.svg";
  const profileImageSizes = "124px";
  const universityLabel = getUniversityLabel(player.university);

  function handleToggleExpanded() {
    setIsExpanded((prev) => !prev);
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

            {/* ── 기간 필터 ── */}
            <div className="flex items-center gap-2">
              <span className="text-[11px] font-medium text-white/30">분석 기간</span>
              <div className="flex items-center gap-1">
                {(["recent90", "all"] as const).map((f) => (
                  <button
                    key={f}
                    type="button"
                    onClick={() => { setMatchFilter(f); setFilterPage(1); }}
                    className={cn(
                      "rounded-lg px-3 py-1.5 text-xs font-semibold transition-all",
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

            {/* ── 기간별 승/패/승률 ── */}
            <Section title="승패 요약">
              <PeriodStatCards
                isLoading={isFilterLoading}
                wins={filteredData?.stats.wins ?? recentSummary.wins}
                losses={filteredData?.stats.losses ?? recentSummary.losses}
                winRate={filteredData?.stats.winRate ?? recentSummary.winRate}
              />
            </Section>

            {/* ── 종족별 승률 (필터 연동) ── */}
            <Section title="종족별 승률">
              <div className={cn("space-y-2 transition-opacity", isFilterLoading ? "opacity-40" : "opacity-100")}>
                {(hasDisplayRaceData
                  ? displayRaceSummaries
                  : [
                      { race: "T" as const, matches: 0, wins: 0, losses: 0, winRate: "0.0%", hasRecord: false },
                      { race: "Z" as const, matches: 0, wins: 0, losses: 0, winRate: "0.0%", hasRecord: false },
                      { race: "P" as const, matches: 0, wins: 0, losses: 0, winRate: "0.0%", hasRecord: false },
                    ]).map((item) => (
                  <RaceStatRow key={item.race} race={item.race} hasRecord={item.hasRecord} wins={item.wins} losses={item.losses} matches={item.matches} winRate={item.winRate} />
                ))}
              </div>
            </Section>

            {recentForm10.length > 0 ? (
              <Section title="최근 10경기 흐름">
                <div className="rounded-xl border border-white/8 bg-white/[0.03] px-4 py-4">
                  <div className="flex flex-wrap items-center gap-1.5">
                    <span className="mr-1 text-[11px] font-medium text-white/30">과거</span>
                    {recentForm10.map((result, index) => {
                      const opacity = 0.35 + (index / Math.max(recentForm10.length - 1, 1)) * 0.65;
                      return (
                        <span
                          key={index}
                          style={{ opacity }}
                          className={cn(
                            "inline-flex h-8 w-8 items-center justify-center rounded-lg text-sm font-semibold",
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
                        {form10Wins}승 {form10Losses}패
                      </span>
                      {form10WinRate !== null ? (
                        <span className={cn(
                          "rounded-full border px-2.5 py-0.5 text-xs font-bold tabular-nums",
                          form10WinRate >= 50
                            ? "border-nzu-green/25 bg-nzu-green/[0.1] text-nzu-green"
                            : "border-red-400/25 bg-red-400/[0.1] text-red-300"
                        )}>
                          {form10WinRate}%
                        </span>
                      ) : null}
                    </div>
                  </div>
                </div>
              </Section>
            ) : null}

            <Section title="경기 기록">
              {matchFilter === "recent90" && !filteredData ? (
                <div className="grid gap-1.5">
                  {recentLogs.length ? (
                    recentLogs.map((log) => <MatchLogRow key={log.id} log={log} />)
                  ) : (
                    <CompactRow value="기록 없음" />
                  )}
                </div>
              ) : isFilterLoading ? (
                <div className="flex items-center gap-2.5 rounded-xl border border-white/7 bg-white/[0.02] px-4 py-4">
                  <div className="h-3.5 w-3.5 shrink-0 animate-spin rounded-full border-2 border-white/10 border-t-nzu-green" />
                  <span className="text-sm font-medium text-white/38">경기 기록을 불러오는 중...</span>
                </div>
              ) : filteredData?.matches.length ? (
                <div className="space-y-1.5">
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
                        onClick={() => setFilterPage((p) => Math.max(1, p - 1))}
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
                        onClick={() => setFilterPage((p) => Math.min(filteredData.totalPages, p + 1))}
                        className="rounded-xl border border-white/10 bg-white/[0.03] px-4 py-2 text-sm font-semibold text-white/55 transition-all hover:border-white/18 hover:bg-white/[0.07] hover:text-white disabled:pointer-events-none disabled:opacity-30"
                      >
                        다음 →
                      </button>
                    </div>
                  ) : null}
                </div>
              ) : (
                <CompactRow value="해당 기간의 기록이 없습니다" />
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

function DataTile({
  title,
  headline,
  lines,
  tone = "neutral",
  className,
  headlineClassName,
}: {
  title?: React.ReactNode;
  headline: string;
  lines: string[];
  tone?: "neutral" | "strong" | "weak" | Race;
  className?: string;
  headlineClassName?: string;
}) {
  const toneClass =
    tone === "T"
      ? "border-terran/20 bg-terran/10"
      : tone === "Z"
        ? "border-zerg/20 bg-zerg/10"
        : tone === "P"
          ? "border-protoss/20 bg-protoss/10"
          : tone === "strong"
            ? "border-nzu-green/18 bg-nzu-green/[0.08]"
            : tone === "weak"
              ? "border-red-400/18 bg-red-400/[0.08]"
              : "border-white/8 bg-white/[0.03]";

  return (
    <div className={cn("rounded-xl border px-3 py-4 text-center md:px-4 md:py-5", toneClass, className)}>
      {title ? <div className="mb-2.5 flex min-h-[24px] items-center justify-center">{title}</div> : null}
      <p className={cn("text-xl font-bold tracking-tight text-white md:text-[1.26rem] xl:text-[1.3rem]", headlineClassName)}>{headline}</p>
      <div className="mt-2 space-y-1">
        {lines.map((line) => (
          <p key={line} className="text-sm font-medium tracking-tight text-white/52">
            {line}
          </p>
        ))}
      </div>
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

function RaceStatRow({
  race,
  hasRecord,
  winRate,
  wins,
  losses,
  matches,
}: {
  race: Race;
  hasRecord: boolean;
  winRate: string;
  wins: number;
  losses: number;
  matches: number;
}) {
  const winRateNum = hasRecord ? parseFloat(winRate) || 0 : 0;
  const toneStyle =
    race === "T"
      ? { border: "border-terran/20 bg-terran/[0.04]", bar: "bg-terran", text: "text-terran" }
      : race === "Z"
        ? { border: "border-zerg/20 bg-zerg/[0.04]", bar: "bg-zerg", text: "text-zerg" }
        : { border: "border-protoss/20 bg-protoss/[0.04]", bar: "bg-protoss", text: "text-protoss" };

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
          className={cn("h-1.5 rounded-full transition-all duration-500", hasRecord ? toneStyle.bar : "bg-white/10")}
          style={{ width: `${Math.min(winRateNum, 100)}%` }}
        />
      </div>
    </div>
  );
}

type MatchHistoryApiItem = {
  id: string;
  result: "승" | "패";
  opponentName: string;
  opponentRace: Race;
  mapName: string;
  dateText: string;
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
};

function MatchLogRow({ log }: { log: MatchHistoryApiItem }) {
  return (
    <div className="grid grid-cols-[auto_minmax(0,1fr)_minmax(0,110px)_auto] items-center gap-3 rounded-xl border border-white/7 bg-white/[0.02] px-3 py-2.5 md:px-4">
      <span
        className={cn(
          "inline-flex h-7 w-12 shrink-0 items-center justify-center rounded-lg text-sm font-semibold",
          log.result === "승" ? "border border-nzu-green/25 bg-nzu-green/[0.12] text-nzu-green" : "border border-red-400/25 bg-red-400/[0.1] text-red-300"
        )}
      >
        {log.result}
      </span>
      <span className="flex min-w-0 items-center gap-2">
        <span className="truncate text-sm font-semibold text-white">{log.opponentName}</span>
        <RaceTag race={log.opponentRace} size="xs" />
      </span>
      <span className="truncate text-sm font-medium text-white/45">{log.mapName}</span>
      <span className="whitespace-nowrap text-xs font-medium text-white/32 tabular-nums">{log.dateText}</span>
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

