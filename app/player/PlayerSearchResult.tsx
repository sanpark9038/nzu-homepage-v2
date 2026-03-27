"use client";

import { useState } from "react";
import Image from "next/image";
import Link from "next/link";
import { LiveBadge, RaceTag, TierBadge, type Race } from "@/components/ui/nzu-badges";
import { cn, getTierLabel, normalizeTier } from "@/lib/utils";
import { type Player } from "@/lib/player-service";

type PlayerMatch = {
  id: string;
  winner_id: string | null;
  player1_id: string | null;
  player2_id: string | null;
  map_name: string | null;
  match_date: string | null;
  player1: { id: string; name: string; photo_url: string | null } | null;
  player2: { id: string; name: string; photo_url: string | null } | null;
};

type Props = {
  player: Player;
  matches: PlayerMatch[];
  recentWinRate: string;
  recentWins: number;
  recentLosses: number;
  recentForm: readonly string[];
};

function normalizeRaceValue(race: string | null | undefined): Race {
  const raw = String(race || "").trim().toUpperCase();
  if (raw.startsWith("Z")) return "Z";
  if (raw.startsWith("P")) return "P";
  return "T";
}

export default function PlayerSearchResult({
  player,
  matches,
  recentWinRate,
  recentWins,
  recentLosses,
  recentForm,
}: Props) {
  const [isExpanded, setIsExpanded] = useState(false);
  const normTier = normalizeTier(player.tier);
  const isElite = ["갓", "킹"].includes(normTier);
  const themeColor = isElite ? "rgba(255, 215, 0, 0.28)" : "rgba(0, 255, 163, 0.22)";
  const displayTier = getTierLabel(player.tier);

  return (
    <div className="overflow-hidden rounded-[1.55rem] border border-white/8 bg-white/[0.03] px-5 py-5 md:px-6 md:py-6">
      <div className="grid gap-5 md:grid-cols-[112px_minmax(0,1fr)_220px] md:grid-rows-[112px_auto]">
        <div className="md:row-span-2">
          <div className="w-28 shrink-0">
            <div className="relative h-28 w-28 overflow-hidden rounded-[1.15rem] border border-white/10 bg-black/30">
              <Image src={player.photo_url || "/placeholder-player.png"} alt={player.name} fill className="object-cover object-top" />
            </div>
            <div className="mt-3 text-center">
              <h2 className="text-[1.32rem] font-[1000] tracking-tight text-white md:text-[1.46rem]">{player.name}</h2>
              {player.nickname ? <p className="mt-1 text-[0.8rem] font-[1000] tracking-tight text-white/42">{player.nickname}</p> : null}
              {player.broadcast_url ? (
                <a href={player.broadcast_url} target="_blank" rel="noreferrer" className="mt-3 inline-flex h-9 w-full items-center justify-center rounded-[0.95rem] border border-sky-400/20 bg-sky-400/[0.09] px-3 text-[0.88rem] font-[1000] tracking-tight text-sky-300 transition-all hover:border-sky-300/36 hover:bg-sky-400/[0.16] hover:text-white">
                  방송국 이동
                </a>
              ) : (
                <button type="button" disabled className="mt-3 inline-flex h-9 w-full items-center justify-center rounded-[0.95rem] border border-sky-400/10 bg-sky-400/[0.04] px-3 text-[0.88rem] font-[1000] tracking-tight text-sky-200/25">
                  방송국 이동
                </button>
              )}
            </div>
          </div>
        </div>

        <div className="min-w-0 md:col-start-2 md:row-start-1 md:h-full">
          <div className="grid h-full gap-3 md:grid-cols-3">
            <StatPanel label="소속">{player.university || "무소속"}</StatPanel>
            <StatPanel label="티어"><TierBadge tier={player.tier || "미정"} size="lg" /></StatPanel>
            <StatPanel label="종족"><RaceTag race={normalizeRaceValue(player.race)} size="lg" /></StatPanel>
          </div>
        </div>

        <div className="flex flex-col gap-2 md:col-start-3 md:row-start-1 md:h-full">
          <button
            type="button"
            onClick={() => setIsExpanded((prev) => !prev)}
            className="group inline-flex h-full min-h-[52px] w-full items-center justify-center rounded-[0.9rem] border border-nzu-green/18 bg-[linear-gradient(180deg,rgba(0,255,163,0.07),rgba(0,255,163,0.03))] px-3 py-2 text-nzu-green transition-all hover:border-nzu-green/36 hover:bg-[linear-gradient(180deg,rgba(0,255,163,0.12),rgba(0,255,163,0.06))] hover:text-white"
          >
            <span className="flex items-center justify-center rounded-[0.78rem] border border-white/6 bg-black/12 px-4 py-2 text-[1.02rem] font-[1000] tracking-tight transition-all group-hover:border-white/12 group-hover:bg-black/18">
              {isExpanded ? "상세 접기" : "상세 보기"}
            </span>
          </button>
          <Link href={`/player/${player.id}`} className="inline-flex min-h-[46px] items-center justify-center rounded-[0.9rem] border border-white/10 bg-white/[0.03] px-3 py-2 text-[0.92rem] font-[1000] tracking-tight text-white/74 transition-all hover:border-white/20 hover:bg-white/[0.06] hover:text-white">
            독립 페이지 열기
          </Link>
        </div>

        <div className="min-w-0 md:col-start-2 md:row-start-2">
          <div className="grid gap-2.5 md:grid-cols-2">
            <div className="px-1"><span className="text-[13px] font-black tracking-wide text-nzu-green">전체: 2025.01.01 ~ 현재</span></div>
            <div className="px-1"><span className="text-[13px] font-black tracking-wide text-red-500">최근: 최근 3개월 전적</span></div>
          </div>
          <div className="mt-2.5 grid gap-2.5 sm:grid-cols-2 xl:grid-cols-4">
            <MetricCard tone="green" label="전체 승률" value={player.win_rate != null ? `${player.win_rate}%` : "-"} />
            <MetricCard tone="green" label="전체 전적" value={`${player.total_wins ?? 0}승 / ${player.total_losses ?? 0}패`} />
            <MetricCard tone="red" label="최근 승률" value={recentWinRate} />
            <MetricCard tone="red" label="최근 전적" value={`${recentWins}승 / ${recentLosses}패`} />
          </div>
        </div>

        <div className="flex h-full flex-col md:col-start-3 md:row-start-2">
          <div className="px-1"><span className="text-[13px] font-black tracking-wide text-white/72">최근 폼: 최근 5경기</span></div>
          <div className="mt-2.5 flex flex-1 flex-col rounded-[1rem] border border-white/8 bg-white/[0.03] px-3 py-3">
            <div className="flex items-center justify-between text-[12px] font-[1000] tracking-tight"><span className="text-white/46">과거</span><span className="text-white/30">→</span><span className="text-white/82">최근</span></div>
            <div className="mt-2 grid grid-cols-5 items-end gap-1.5">
              {recentForm.map((result, index) => (
                <span
                  key={`${result}-${index}`}
                  className={cn(
                    "inline-flex w-full items-center justify-center rounded-[0.7rem] border font-[1000] tracking-tight",
                    index < 2 ? "h-7 text-[0.78rem]" : index === 2 ? "h-8 text-[0.84rem]" : index === 3 ? "h-9 text-[0.9rem]" : "h-10 text-[0.98rem]",
                    result === "승" ? "border-nzu-green/25 bg-nzu-green/[0.1] text-nzu-green" : "border-red-400/25 bg-red-400/[0.1] text-red-300",
                  )}
                >
                  {result}
                </span>
              ))}
            </div>
          </div>
        </div>
      </div>

      {isExpanded ? (
        <section className="relative mt-5 overflow-hidden rounded-[1.6rem] border border-white/8 bg-[#0a0f0d] p-5 shadow-[0_28px_70px_rgba(0,0,0,0.32)] md:p-7">
          <div className="pointer-events-none absolute -right-24 -top-24 h-[280px] w-[280px] rounded-full blur-[110px] opacity-30" style={{ backgroundColor: themeColor }} />
          <div className="relative">
            <div className="mb-5 flex items-center justify-between gap-3">
              <div>
                <p className="text-[11px] font-black uppercase tracking-[0.32em] text-white/32">expanded player card</p>
                <h3 className="mt-2 text-[1.35rem] font-[1000] tracking-tight text-white md:text-[1.7rem]">{player.name} 상세 분석</h3>
              </div>
              <div className="flex items-center gap-2">
                <TierBadge tier={player.tier || "미정"} size="sm" />
                <RaceTag race={normalizeRaceValue(player.race)} size="sm" />
                {player.is_live ? <LiveBadge /> : null}
              </div>
            </div>

            <div className="grid gap-5 lg:grid-cols-[220px_minmax(0,1fr)]">
              <div className="space-y-3">
                <div className="relative aspect-[4/5] overflow-hidden rounded-[1.2rem] border border-white/10 bg-black/35">
                  <Image src={player.photo_url || "/placeholder-player.png"} alt={player.name} fill className="object-cover object-top" />
                </div>
                <div className="rounded-[1rem] border border-white/8 bg-white/[0.03] p-4">
                  <p className="text-[11px] font-black uppercase tracking-[0.18em] text-white/32">Profile</p>
                  <div className="mt-3 space-y-2 text-sm font-[1000] text-white/78">
                    <p>{player.nickname || "별칭 정보 없음"}</p>
                    <p>{player.university || "무소속"}</p>
                    <p>{displayTier}</p>
                  </div>
                </div>
              </div>

              <div className="space-y-5">
                <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
                  <MetricCard tone="neutral" label="Tier Status" value={displayTier} />
                  <MetricCard tone="neutral" label="Elo Rating" value={player.elo_point?.toLocaleString() ?? "1,000"} />
                  <MetricCard tone="neutral" label="Win Rate" value={player.win_rate != null ? `${player.win_rate}%` : "-"} />
                  <MetricCard tone="neutral" label="Record" value={`${(player.total_wins ?? 0) + (player.total_losses ?? 0)}경기`} />
                </div>

                <div>
                  <div className="mb-3 flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      <div className="h-2 w-2 rounded-full bg-nzu-green shadow-[0_0_8px_rgba(46,213,115,0.45)]" />
                      <h4 className="text-sm font-black uppercase tracking-[0.24em] text-white">Tactical Logs</h4>
                    </div>
                    <span className="text-[10px] font-black uppercase tracking-[0.22em] text-white/24">최근 {matches.length}경기</span>
                  </div>
                  <div className="grid gap-3 md:grid-cols-2">
                    {matches.length === 0 ? (
                      <div className="md:col-span-2 rounded-[1rem] border border-dashed border-white/8 bg-white/[0.02] px-4 py-10 text-center text-[11px] font-black uppercase tracking-[0.22em] text-white/24">NO DATA FOUND</div>
                    ) : (
                      matches.map((match) => {
                        const isWinner = match.winner_id === player.id;
                        const opponent = match.player1_id === player.id ? match.player2 : match.player1;
                        return (
                          <div key={match.id} className="group relative flex items-center justify-between rounded-[1rem] border border-white/6 bg-white/[0.02] p-4 transition-all duration-300 hover:border-white/12 hover:bg-white/[0.04]">
                            <div className={cn("absolute left-0 top-0 h-full w-1 rounded-l-[1rem]", isWinner ? "bg-nzu-green" : "bg-red-400/65")} />
                            <div className="flex items-center gap-4 pl-2">
                              <div className={cn("flex h-7 w-14 items-center justify-center rounded text-[10px] font-black tracking-[0.18em]", isWinner ? "bg-nzu-green text-black" : "bg-white/6 text-white/45")}>
                                {isWinner ? "WIN" : "LOSE"}
                              </div>
                              <div className="flex items-center gap-3">
                                <div className="relative h-11 w-11 overflow-hidden rounded-lg border border-white/10 bg-black/40">
                                  <Image src={opponent?.photo_url || "/placeholder-player.png"} alt={opponent?.name || "Player"} fill className="object-cover" />
                                </div>
                                <div>
                                  <span className="mb-0.5 block text-[8px] font-black uppercase tracking-[0.22em] text-white/20">VS</span>
                                  <span className="text-sm font-bold tracking-tight text-white">{opponent?.name || "UNKNOWN"}</span>
                                </div>
                              </div>
                            </div>
                            <div className="text-right">
                              <p className="text-[10px] font-black uppercase tracking-[0.18em] text-white/34">{match.map_name || "ARENA"}</p>
                              <p className="mt-1 text-[10px] font-medium tabular-nums text-white/16">{match.match_date ? new Date(match.match_date).toLocaleDateString() : "-"}</p>
                            </div>
                          </div>
                        );
                      })
                    )}
                  </div>
                </div>
              </div>
            </div>
          </div>
        </section>
      ) : null}
    </div>
  );
}

function StatPanel({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex h-full flex-col justify-center rounded-[1.05rem] border border-white/8 bg-white/[0.045] px-4 py-3">
      <p className="text-[13px] font-[1000] uppercase tracking-[0.12em] text-white/40">{label}</p>
      <div className="mt-1.5 text-[1.22rem] font-[1000] tracking-tight text-white md:text-[1.38rem]">{children}</div>
    </div>
  );
}

function MetricCard({ tone, label, value }: { tone: "green" | "red" | "neutral"; label: string; value: string }) {
  const toneClass =
    tone === "green"
      ? "border-nzu-green/18 bg-nzu-green/[0.07]"
      : tone === "red"
        ? "border-red-400/18 bg-red-400/[0.06]"
        : "border-white/8 bg-white/[0.03]";
  const labelClass = tone === "green" ? "text-nzu-green/72" : tone === "red" ? "text-red-300/78" : "text-white/32";
  return (
    <div className={cn("rounded-[1rem] px-3 py-3.5", toneClass)}>
      <p className={cn("text-[12px] font-[1000] tracking-tight", labelClass)}>{label}</p>
      <p className="mt-1.5 text-[1.18rem] font-[1000] tracking-tight text-white md:text-[1.28rem]">{value}</p>
    </div>
  );
}
