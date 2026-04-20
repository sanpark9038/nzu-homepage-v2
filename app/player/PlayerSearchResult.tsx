"use client";

import Image from "next/image";
import Link from "next/link";
import { useState } from "react";

import { RaceTag, TierBadge, type Race } from "@/components/ui/nzu-badges";
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
import { buildSoopThumbnailProxyUrl, resolveSoopChannelImageUrl, resolveSoopChannelUrl, resolveSoopWatchUrl } from "@/lib/soop";
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
};

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
  return <PlayerSearchResultInner key={`${props.player.id}:${props.player.live_thumbnail_url || ""}:${props.recentLogs.length}:${defaultExpanded ? "1" : "0"}`} defaultExpanded={defaultExpanded} {...props} />;
}

function PlayerSearchResultInner({
  player,
  raceSummaries,
  strongestMap,
  weakestMap,
  raceBestMaps,
  spawnPartner,
  recentLogs,
  recentSummary,
  defaultExpanded = false,
}: Props) {
  const [isExpanded, setIsExpanded] = useState(defaultExpanded);
  const [visibleRecentCount, setVisibleRecentCount] = useState(5);
  const [failedThumbnailSrc, setFailedThumbnailSrc] = useState<string | null>(null);

  const normTier = normalizeTier(player.tier);
  const isElite = ["갓", "킹"].includes(normTier);
  const themeColor = isElite ? "rgba(255, 215, 0, 0.28)" : "rgba(0, 255, 163, 0.22)";
  const recentForm = recentSummary.form;
  const visibleRecentLogs = recentLogs.slice(0, visibleRecentCount);
  const canExpandRecentLogs = recentLogs.length > visibleRecentCount;
  const canCollapseRecentLogs = recentLogs.length > 5 && visibleRecentCount > 5;
  const hasRaceData = raceSummaries.some((item) => item.hasRecord);
  const hasRaceBestMaps = raceBestMaps.some((item) => item.bestMap);
  const channelUrl = resolveSoopChannelUrl(player);
  const liveWatchUrl = player.is_live ? resolveSoopWatchUrl(player) : null;
  const liveThumbnailUrl = buildSoopThumbnailProxyUrl(player.live_thumbnail_url) || player.live_thumbnail_url || "";
  const canShowLiveThumbnail = Boolean(liveThumbnailUrl) && failedThumbnailSrc !== liveThumbnailUrl;
  const liveElapsedText = formatLiveElapsed(player.live_started_at);
  const profileImageUrl = resolveSoopChannelImageUrl(player) || player.photo_url || "/placeholder-player.png";
  const universityLabel = getUniversityLabel(player.university);

  function handleToggleExpanded() {
    setIsExpanded((prev) => {
      if (prev) setVisibleRecentCount(5);
      return !prev;
    });
  }

  return (
    <div className="overflow-hidden rounded-[1.55rem] border border-white/8 bg-white/[0.03] px-4 py-4 md:overflow-visible md:px-6 md:py-5 xl:px-7 xl:py-6">
      <div className="grid gap-5 md:grid-cols-[112px_minmax(0,1fr)_220px] md:grid-rows-[112px_auto]">
        <div className="md:row-span-2">
          <div className="group relative w-28 shrink-0">
            <div className="relative h-28 w-28 overflow-hidden rounded-[1.15rem] border border-white/10 bg-black/30">
              {liveWatchUrl ? (
                <Link href={liveWatchUrl} target="_blank" rel="noreferrer" className="block h-full w-full">
                  <Image src={profileImageUrl} alt={player.name} fill className="object-cover object-top transition-transform duration-300 hover:scale-105" />
                </Link>
              ) : (
                <Image src={profileImageUrl} alt={player.name} fill className="object-cover object-top" />
              )}
              {player.is_live ? (
                <div className="absolute right-2 top-2 inline-flex items-center rounded-full bg-red-600 px-2 py-0.5 text-[10px] font-black tracking-tight text-white shadow-lg">
                  LIVE
                </div>
              ) : null}
            </div>

            {player.is_live ? (
              <div className="pointer-events-none absolute bottom-[calc(100%+0.9rem)] left-[-1rem] z-20 hidden w-[29rem] overflow-hidden rounded-[1rem] border border-white/10 bg-[#061015] opacity-0 shadow-[0_20px_45px_rgba(0,0,0,0.38)] transition-all duration-200 md:block md:translate-y-2 md:scale-[0.98] group-hover:translate-y-0 group-hover:scale-100 group-hover:opacity-100">
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
                      <div className="inline-flex items-center rounded-full border border-white/12 bg-black/45 px-2.5 py-0.5 text-[11px] font-[1000] tracking-tight text-white">
                        {player.live_viewers}명 시청 중
                      </div>
                    ) : null}
                    {liveElapsedText ? (
                      <div className="inline-flex items-center rounded-full border border-white/12 bg-black/45 px-2.5 py-0.5 text-[11px] font-[1000] tracking-tight text-white">
                        {liveElapsedText}
                      </div>
                    ) : null}
                  </div>
                  <div className="absolute inset-x-0 bottom-0 p-4">
                    <p className="line-clamp-2 text-[1.06rem] font-[1000] leading-snug text-white">
                      {player.broadcast_title || `${player.name} 방송 중`}
                    </p>
                    <div className="mt-2 text-[0.78rem] font-[900] tracking-tight text-white/68">
                      <span className="truncate">{player.name}</span>
                    </div>
                  </div>
                </div>
              </div>
            ) : null}

            <div className="mt-3 text-center">
              <h2 className="text-[1.36rem] font-[1000] tracking-tight text-white md:text-[1.54rem] xl:text-[1.66rem]">{player.name}</h2>
              {player.nickname ? <p className="mt-1 text-[0.82rem] font-[1000] tracking-tight text-white/42 md:text-[0.86rem]">{player.nickname}</p> : null}
              {channelUrl ? (
                <a href={channelUrl} target="_blank" rel="noreferrer" className="mt-3 inline-flex h-9 w-full items-center justify-center rounded-[0.95rem] border border-sky-400/20 bg-sky-400/[0.09] px-3 text-[0.9rem] font-[1000] tracking-tight text-sky-300 transition-all hover:border-sky-300/36 hover:bg-sky-400/[0.16] hover:text-white md:h-10 md:text-[0.94rem]">
                  방송 채널 보기
                </a>
              ) : (
                <button type="button" disabled aria-disabled="true" className="mt-3 inline-flex h-9 w-full items-center justify-center rounded-[0.95rem] border border-white/12 bg-white/[0.05] px-3 text-[0.9rem] font-[1000] tracking-tight text-white/50 md:h-10 md:text-[0.94rem]">
                  방송 채널 보기
                </button>
              )}
            </div>
          </div>
        </div>

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

        <div className="md:col-start-3 md:row-start-1 md:h-full">
          <button
            type="button"
            onClick={handleToggleExpanded}
            className="group inline-flex h-full min-h-[52px] w-full items-center justify-center rounded-[0.9rem] border border-nzu-green/18 bg-[linear-gradient(180deg,rgba(0,255,163,0.07),rgba(0,255,163,0.03))] px-3 py-2 text-nzu-green transition-all hover:border-nzu-green/36 hover:bg-[linear-gradient(180deg,rgba(0,255,163,0.12),rgba(0,255,163,0.06))] hover:text-white"
          >
            <span className="flex items-center justify-center rounded-[0.78rem] border border-white/6 bg-black/12 px-4 py-2 text-[1.02rem] font-[1000] tracking-tight transition-all group-hover:border-white/12 group-hover:bg-black/18">
              {isExpanded ? "상세 닫기" : "상세 리포트"}
            </span>
          </button>
        </div>

        <div className="min-w-0 md:col-start-2 md:row-start-2">
          <div className="grid gap-2.5 md:grid-cols-2">
            <div className="px-1">
              <span className="text-[13px] font-black tracking-wide text-nzu-green md:text-[13.5px]">통산 기준: 2025.01.01 ~ 현재</span>
            </div>
            <div className="px-1">
              <span className="text-[13px] font-black tracking-wide text-red-500 md:text-[13.5px]">최근 기준: 최근 3개월 경기</span>
            </div>
          </div>
          <div className="mt-2.5 grid gap-2.5 sm:grid-cols-2 xl:grid-cols-4">
            <MetricCard tone="green" label="통산 승률" value={player.win_rate != null ? `${player.win_rate}%` : "-"} />
            <MetricCard tone="green" label="통산 전적" value={`${player.total_wins ?? 0}승 / ${player.total_losses ?? 0}패`} />
            <MetricCard tone="red" label="최근 승률" value={recentSummary.winRate} />
            <MetricCard tone="red" label="최근 전적" value={`${recentSummary.wins}승 / ${recentSummary.losses}패`} />
          </div>
        </div>

        <div className="flex h-full flex-col md:col-start-3 md:row-start-2">
          <div className="px-1">
            <span className="text-[13px] font-black tracking-wide text-white/72 md:text-[13.5px]">최근 5경기 흐름</span>
          </div>
          <div className="mt-2.5 flex flex-1 flex-col rounded-[1rem] border border-white/8 bg-white/[0.03] px-3 py-3 xl:px-3.5 xl:py-3.5">
            <div className="flex items-center justify-between text-[12px] font-[1000] tracking-tight md:text-[12.5px]">
              <span className="text-white/46">과거</span>
              <span className="text-white/30">→</span>
              <span className="text-white/82">최근</span>
            </div>
            {recentForm.length ? (
              <div className="mt-2 grid grid-cols-5 items-end gap-1.5">
                {recentForm.map((result, index) => (
                  <span
                    key={`${result}-${index}`}
                    className={cn(
                      "inline-flex w-full items-center justify-center rounded-[0.7rem] border font-[1000] tracking-tight",
                      index < 2 ? "h-7 text-[0.8rem] md:h-8 md:text-[0.84rem]" : index === 2 ? "h-8 text-[0.86rem] md:h-9 md:text-[0.9rem]" : index === 3 ? "h-9 text-[0.92rem] md:h-10 md:text-[0.98rem]" : "h-10 text-[1rem] md:h-11 md:text-[1.06rem]",
                      result === "승" ? "border-nzu-green/25 bg-nzu-green/[0.1] text-nzu-green" : "border-red-400/25 bg-red-400/[0.1] text-red-300"
                    )}
                  >
                    {result}
                  </span>
                ))}
              </div>
            ) : (
              <div className="mt-2 flex flex-1 items-center justify-center rounded-[0.8rem] border border-dashed border-white/8 bg-black/10 px-3 py-4 text-[0.84rem] font-[900] tracking-tight text-white/38">
                최근 경기 기록이 없습니다
              </div>
            )}
          </div>
        </div>
      </div>

      {isExpanded ? (
        <section className="relative mt-5 overflow-hidden rounded-[1.2rem] border border-white/8 bg-[#0a0f0d] px-3 py-3 shadow-[0_18px_42px_rgba(0,0,0,0.24)] md:px-3.5 md:py-3.5 xl:px-4 xl:py-4">
          <div className="pointer-events-none absolute -right-16 -top-16 h-[180px] w-[180px] rounded-full blur-[90px] opacity-20" style={{ backgroundColor: themeColor }} />
          <div className="relative space-y-3">
            <Section title="가장 많이 만난 상대">
              <div className="rounded-[1rem] border border-nzu-green/14 bg-[linear-gradient(180deg,rgba(0,255,163,0.08),rgba(255,255,255,0.02))] px-3 py-3.5">
                {spawnPartner ? (
                  <div className="space-y-2.5">
                    <div className="rounded-[0.9rem] border border-white/8 bg-black/15 px-3 py-3.5 text-center">
                      <div className="flex items-center justify-center gap-2.5">
                        <span className="truncate text-[1.4rem] font-[1000] tracking-tight text-white md:text-[1.56rem] xl:text-[1.68rem]">{spawnPartner.name}</span>
                        <RaceTag race={spawnPartner.race} size="sm" />
                      </div>
                    </div>
                    <div className="grid gap-2 sm:grid-cols-2">
                      <div className="rounded-[0.85rem] border border-white/8 bg-black/15 px-2.5 py-2 text-center">
                        <div className="flex items-center justify-center gap-2 text-[1rem] font-[1000] tracking-tight text-white md:text-[1.08rem]">
                          <span>승률</span>
                          <span>{Math.round((spawnPartner.wins / spawnPartner.matches) * 100)}%</span>
                        </div>
                      </div>
                      <div className="rounded-[0.85rem] border border-white/8 bg-black/15 px-2.5 py-2 text-center">
                        <div className="flex items-center justify-center gap-2 text-[1rem] font-[1000] tracking-tight text-white md:text-[1.08rem]">
                          <span>전적</span>
                          <span>{spawnPartner.matches}전 {spawnPartner.wins}승 {spawnPartner.losses}패</span>
                        </div>
                      </div>
                    </div>
                  </div>
                ) : (
                  <CompactRow value="기록 없음" />
                )}
              </div>
            </Section>

            <div className="grid items-start gap-3 lg:grid-cols-[minmax(0,1.15fr)_minmax(0,0.85fr)]">
              <Section title="종족별 승률">
                <div className="grid gap-2 md:grid-cols-3">
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
                      lines={item.hasRecord ? [`${item.matches}전 중 ${item.wins}승 ${item.losses}패`] : ["기록 없음"]}
                      tone={item.race}
                    />
                  ))}
                </div>
              </Section>

              <div className="grid gap-3 md:grid-cols-2">
                <Section title="최고 맵" titleClassName="text-nzu-green">
                  <DataTile
                    headline={strongestMap ? strongestMap.mapName : "표본 부족"}
                    lines={strongestMap ? [strongestMap.winRate, `${strongestMap.matches}전 중 ${strongestMap.wins}승 ${strongestMap.losses}패`] : ["표본 부족"]}
                    tone="strong"
                    headlineClassName="md:text-[1.24rem] xl:text-[1.28rem]"
                  />
                </Section>
                <Section title="주의 맵" titleClassName="text-red-300">
                  <DataTile
                    headline={weakestMap ? weakestMap.mapName : "표본 부족"}
                    lines={weakestMap ? [weakestMap.winRate, `${weakestMap.matches}전 중 ${weakestMap.wins}승 ${weakestMap.losses}패`] : ["표본 부족"]}
                    tone="weak"
                    headlineClassName="md:text-[1.24rem] xl:text-[1.28rem]"
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
              <div className="grid gap-2 md:grid-cols-3">
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
                      className="grid grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)] items-center gap-2 rounded-[0.85rem] border border-white/7 bg-white/[0.02] px-2.5 py-2 text-[0.78rem] font-[900] tracking-tight text-white/78 md:px-3"
                    >
                      <span className="flex min-w-0 items-center gap-2">
                        <span
                          className={cn(
                            "inline-flex h-6 w-10 shrink-0 items-center justify-center rounded-[0.55rem] text-[0.72rem] md:w-11",
                            log.result === "승" ? "border border-nzu-green/25 bg-nzu-green/[0.12] text-nzu-green" : "border border-red-400/25 bg-red-400/[0.1] text-red-300"
                          )}
                        >
                          {log.result}
                        </span>
                        <span className="flex min-w-0 items-center gap-1.5">
                          <span className="whitespace-nowrap text-[0.88rem] text-white md:text-[0.92rem]">{log.opponentName}</span>
                          <RaceTag race={log.opponentRace} size="xs" />
                        </span>
                      </span>
                      <span className="truncate text-center text-white/52 md:text-[0.82rem]">{log.mapName}</span>
                      <span className="justify-self-end text-right tabular-nums text-white/46 md:text-[0.8rem]">{log.dateText}</span>
                    </div>
                  ))
                ) : (
                  <CompactRow value="기록 없음" />
                )}
                {recentLogs.length > 5 ? (
                  <div className="mt-1 flex justify-center gap-2">
                    {canExpandRecentLogs ? (
                      <button
                        type="button"
                        onClick={() => setVisibleRecentCount((count) => Math.min(count + 5, recentLogs.length))}
                        className="rounded-[0.8rem] border border-nzu-green/18 bg-nzu-green/[0.06] px-4 py-2 text-[0.82rem] font-[1000] tracking-tight text-nzu-green transition-all hover:border-nzu-green/36 hover:bg-nzu-green/[0.12] hover:text-white"
                      >
                        최근 기록 더보기
                      </button>
                    ) : null}
                    {canCollapseRecentLogs ? (
                      <button
                        type="button"
                        onClick={() => setVisibleRecentCount(5)}
                        className="rounded-[0.8rem] border border-white/10 bg-white/[0.03] px-4 py-2 text-[0.82rem] font-[1000] tracking-tight text-white/70 transition-all hover:border-white/16 hover:bg-white/[0.06] hover:text-white"
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
    <div className="space-y-1.5">
      <p className={cn("text-center text-[0.9rem] font-[1000] tracking-[0.02em] text-white/76 md:text-[0.96rem]", titleClassName)}>{title}</p>
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
    <div className="flex items-center gap-2 rounded-[0.85rem] border border-white/7 bg-white/[0.02] px-2.5 py-2 text-[0.76rem] font-[900] tracking-tight text-white/78">
      {leading ? <span className="shrink-0">{leading}</span> : null}
      {label ? <span className="shrink-0 text-white/56">{label}</span> : null}
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
    <div className={cn("rounded-[1rem] px-2.5 py-2.5 text-center md:px-3 md:py-3", toneClass, className)}>
      {title ? <div className="mb-1.5 flex min-h-[24px] items-center justify-center">{title}</div> : null}
      <p className={cn("line-clamp-1 text-[1.12rem] font-[1000] tracking-tight text-white md:text-[1.18rem] xl:text-[1.22rem]", headlineClassName)}>{headline}</p>
      <div className="mt-1.5 space-y-0.5">
        {lines.map((line) => (
          <p key={line} className="text-[0.82rem] font-[900] tracking-tight text-white/68 md:text-[0.86rem]">
            {line}
          </p>
        ))}
      </div>
    </div>
  );
}

function StatPanel({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex h-full flex-col justify-center rounded-[1.05rem] border border-white/8 bg-white/[0.045] px-3.5 py-3 md:px-4 md:py-3.5">
      <p className="text-[13px] font-[1000] uppercase tracking-[0.12em] text-white/40 md:text-[13.5px]">{label}</p>
      <div className="mt-1.5 text-[1.24rem] font-[1000] tracking-tight text-white md:text-[1.42rem] xl:text-[1.48rem]">{children}</div>
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
    <div className={cn("rounded-[1rem] px-2.5 py-3 text-center md:px-3 md:py-3.5", toneClass)}>
      <p className={cn("text-[12px] font-[1000] tracking-tight md:text-[12.5px]", labelClass)}>{label}</p>
      {isRecordCard && recordLines.length > 1 ? (
        <div className="mt-1.5 space-y-0.5">
          {recordLines.map((line) => (
            <p key={line} className="text-[1.14rem] font-[1000] tracking-tight text-white md:text-[1.22rem] xl:text-[1.26rem]">
              {line}
            </p>
          ))}
        </div>
      ) : isEmptyValue ? (
        <p className="mt-2 text-[1.04rem] font-[1000] tracking-tight text-white/54 md:text-[1.1rem]">없음</p>
      ) : (
        <p className="mt-1.5 text-[1.22rem] font-[1000] tracking-tight text-white md:text-[1.32rem] xl:text-[1.38rem]">{compactValue}</p>
      )}
    </div>
  );
}
