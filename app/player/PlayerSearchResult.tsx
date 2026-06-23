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
  const [isExpanded, setIsExpanded] = useState(defaultExpanded);
  const [visibleRecentCount, setVisibleRecentCount] = useState(5);
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

  const normTier = normalizeTier(player.tier);
  const isElite = ["갓", "킹"].includes(normTier);
  const themeColor = isElite ? "rgba(255, 215, 0, 0.28)" : "rgba(0, 255, 163, 0.22)";
  const {
    raceSummaries,
    strongestMap,
    weakestMap,
    raceBestMaps,
    spawnPartner,
    recentLogs,
    recentSummary,
  } = detailSummary;
  const recentForm = recentSummary.form;
  const visibleRecentLogs = recentLogs.slice(0, visibleRecentCount);
  const canExpandRecentLogs = recentLogs.length > visibleRecentCount;
  const canCollapseRecentLogs = recentLogs.length > 5 && visibleRecentCount > 5;
  const hasRaceData = raceSummaries.some((item) => item.hasRecord);
  const hasRaceBestMaps = raceBestMaps.some((item) => item.bestMap);
  const channelUrl = resolveSoopChannelUrl(player);
  const liveWatchUrl = player.is_live ? resolveSoopWatchUrl(player) : null;
  const liveThumbnailUrl = normalizeSoopImageUrl(player.live_thumbnail_url) || "";
  const canShowLiveThumbnail = Boolean(liveThumbnailUrl) && failedThumbnailSrc !== liveThumbnailUrl;
  const profileImageUrl = resolveSoopChannelImageUrl(player) || player.photo_url || "/placeholder-player.svg";
  const profileImageSizes = "124px";
  const universityLabel = getUniversityLabel(player.university);

  function handleToggleExpanded() {
    setIsExpanded((prev) => {
      if (prev) setVisibleRecentCount(5);
      return !prev;
    });
  }

  return (
    <div className="overflow-hidden rounded-2xl border border-white/8 bg-white/[0.03] px-5 py-5 md:overflow-visible md:px-7 md:py-6 xl:px-8 xl:py-7">
      <div className="grid gap-6 md:grid-cols-[124px_minmax(0,1fr)_240px] md:grid-rows-[124px_auto]">

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

        {/* ── 기본 정보 패널 (학교/티어/종족) ── */}
        <div className="min-w-0 md:col-start-2 md:row-start-1 md:h-full">
          <div className="grid h-full gap-3 md:grid-cols-3">
            <StatPanel label="학교">{universityLabel}</StatPanel>
            <StatPanel label="티어">
              <TierBadge tier={player.tier || "미정"} size="lg" />
            </StatPanel>
            <StatPanel label="종족">
              <RaceTag race={normalizeRaceValue(player.race)} size="lg" />
            </StatPanel>
          </div>
        </div>

        {/* ── 상세 리포트 버튼 ── */}
        <div className="md:col-start-3 md:row-start-1 md:h-full">
          <button
            type="button"
            onClick={handleToggleExpanded}
            className="inline-flex h-full min-h-[52px] w-full items-center justify-center rounded-xl border border-nzu-green/20 bg-nzu-green/[0.07] px-4 py-3 text-nzu-green transition-all hover:border-nzu-green/38 hover:bg-nzu-green/[0.12]"
          >
            <span className="text-base font-semibold tracking-tight">
              {isExpanded ? "상세 닫기" : "상세 리포트"}
            </span>
          </button>
        </div>

        {/* ── 지표 카드 (승률/전적) ── */}
        <div className="min-w-0 md:col-start-2 md:row-start-2">
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

        {/* ── 최근 5경기 흐름 ── */}
        <div className="flex h-full flex-col md:col-start-3 md:row-start-2">
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

      {/* ── 상세 리포트 (펼쳤을 때) ── */}
      {isExpanded ? (
        <section className="relative mt-6 overflow-hidden rounded-2xl border border-white/8 bg-[#0a0f0d] px-4 py-5 shadow-[0_18px_42px_rgba(0,0,0,0.24)] md:px-5 md:py-6 xl:px-6 xl:py-7">
          <div className="pointer-events-none absolute -right-16 -top-16 h-[180px] w-[180px] rounded-full blur-[90px] opacity-20" style={{ backgroundColor: themeColor }} />
          <div className="relative space-y-6">

            <Section title="스폰 깐부">
              <div className="rounded-xl border border-nzu-green/14 bg-[linear-gradient(180deg,rgba(0,255,163,0.08),rgba(255,255,255,0.02))] px-4 py-4">
                {spawnPartner ? (
                  <div className="space-y-3">
                    <div className="rounded-xl border border-white/8 bg-black/15 px-4 py-4 text-center">
                      <div className="flex items-center justify-center gap-3">
                        <span className="truncate text-2xl font-bold tracking-tight text-white md:text-3xl">{spawnPartner.name}</span>
                        <RaceTag race={spawnPartner.race} size="sm" />
                      </div>
                    </div>
                    <div className="grid gap-2.5 sm:grid-cols-2">
                      <div className="rounded-xl border border-white/8 bg-black/15 px-3 py-3.5 text-center">
                        <p className="text-[11px] font-medium uppercase tracking-widest text-white/38">승률</p>
                        <p className="mt-1.5 text-2xl font-extrabold tracking-tight text-white">
                          {Math.round((spawnPartner.wins / spawnPartner.matches) * 100)}%
                        </p>
                      </div>
                      <div className="rounded-xl border border-white/8 bg-black/15 px-3 py-3.5 text-center">
                        <p className="text-[11px] font-medium uppercase tracking-widest text-white/38">전적</p>
                        <p className="mt-1.5 text-base font-semibold tracking-tight text-white">
                          {spawnPartner.matches}전 {spawnPartner.wins}승 {spawnPartner.losses}패
                        </p>
                      </div>
                    </div>
                  </div>
                ) : (
                  <CompactRow value="기록 없음" />
                )}
              </div>
            </Section>

            <div className="grid items-start gap-4 lg:grid-cols-[minmax(0,1.15fr)_minmax(0,0.85fr)]">
              <Section title="종족별 승률">
                <div className="grid gap-2.5 md:grid-cols-3">
                  {(hasRaceData
                    ? raceSummaries
                    : [
                        { race: "T" as const, matches: 0, wins: 0, losses: 0, winRate: "기록 없음", hasRecord: false },
                        { race: "Z" as const, matches: 0, wins: 0, losses: 0, winRate: "기록 없음", hasRecord: false },
                        { race: "P" as const, matches: 0, wins: 0, losses: 0, winRate: "기록 없음", hasRecord: false },
                      ]).map((item) => (
                    <DataTile
                      key={item.race}
                      title={<RaceTag race={item.race} size="xs" />}
                      headline={item.hasRecord ? item.winRate : "기록 없음"}
                      lines={item.hasRecord ? [`${item.matches}전 · ${item.wins}승 ${item.losses}패`] : ["기록 없음"]}
                      tone={item.race}
                    />
                  ))}
                </div>
              </Section>

              <div className="grid gap-3 md:grid-cols-2">
                <Section title="강한 맵" titleClassName="text-nzu-green">
                  <DataTile
                    headline={strongestMap ? strongestMap.mapName : "표본 부족"}
                    lines={strongestMap ? [strongestMap.winRate, `${strongestMap.matches}전 · ${strongestMap.wins}승 ${strongestMap.losses}패`] : ["표본 부족"]}
                    tone="strong"
                    headlineClassName="md:text-xl xl:text-[1.24rem]"
                  />
                </Section>
                <Section title="약한 맵" titleClassName="text-red-300">
                  <DataTile
                    headline={weakestMap ? weakestMap.mapName : "표본 부족"}
                    lines={weakestMap ? [weakestMap.winRate, `${weakestMap.matches}전 · ${weakestMap.wins}승 ${weakestMap.losses}패`] : ["표본 부족"]}
                    tone="weak"
                    headlineClassName="md:text-xl xl:text-[1.24rem]"
                  />
                </Section>
              </div>
            </div>

            <Section
              title={
                <>
                  <span>종족별 대표</span>
                  <span className="text-nzu-green"> 강점 맵</span>
                </>
              }
            >
              <div className="grid gap-2.5 md:grid-cols-3">
                {(hasRaceBestMaps
                  ? raceBestMaps
                  : [
                      { race: "T" as const, bestMap: null },
                      { race: "Z" as const, bestMap: null },
                      { race: "P" as const, bestMap: null },
                    ]).map((item) => (
                  <DataTile
                    key={item.race}
                    title={<RaceTag race={item.race} size="xs" />}
                    headline={item.bestMap ? item.bestMap.mapName : "표본 부족"}
                    lines={item.bestMap ? [`${item.bestMap.matches}전`, `${item.bestMap.wins}승 ${item.bestMap.losses}패 · ${item.bestMap.winRate}`] : ["표본 부족"]}
                    tone={item.race}
                  />
                ))}
              </div>
            </Section>

            <Section title="최근 경기 기록">
              <div className="grid gap-1.5">
                {recentLogs.length ? (
                  visibleRecentLogs.map((log) => (
                    <div
                      key={log.id}
                      className="grid grid-cols-[auto_minmax(0,1fr)_minmax(0,110px)_auto] items-center gap-3 rounded-xl border border-white/7 bg-white/[0.02] px-3 py-2.5 md:px-4"
                    >
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
                  ))
                ) : (
                  <CompactRow value="기록 없음" />
                )}
                {recentLogs.length > 5 ? (
                  <div className="mt-1.5 flex justify-center gap-2">
                    {canExpandRecentLogs ? (
                      <button
                        type="button"
                        onClick={() => setVisibleRecentCount((count) => Math.min(count + 5, recentLogs.length))}
                        className="rounded-xl border border-nzu-green/18 bg-nzu-green/[0.06] px-5 py-2.5 text-sm font-semibold text-nzu-green transition-all hover:border-nzu-green/36 hover:bg-nzu-green/[0.12] hover:text-white"
                      >
                        최근 기록 더보기
                      </button>
                    ) : null}
                    {canCollapseRecentLogs ? (
                      <button
                        type="button"
                        onClick={() => setVisibleRecentCount(5)}
                        className="rounded-xl border border-white/10 bg-white/[0.03] px-5 py-2.5 text-sm font-semibold text-white/60 transition-all hover:border-white/18 hover:bg-white/[0.06] hover:text-white"
                      >
                        접기
                      </button>
                    ) : null}
                  </div>
                ) : null}
              </div>
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
      <p className={cn("text-[11px] font-semibold uppercase tracking-widest text-white/38", titleClassName)}>{title}</p>
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
    <div className="flex h-full flex-col justify-center rounded-xl border border-white/8 bg-white/[0.045] px-4 py-4 md:px-5 md:py-5">
      <p className="text-[11px] font-medium uppercase tracking-widest text-white/38">{label}</p>
      <div className="mt-2 text-[1.35rem] font-bold tracking-tight text-white md:text-[1.5rem] xl:text-[1.6rem]">{children}</div>
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
