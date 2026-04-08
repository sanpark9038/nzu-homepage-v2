import Link from "next/link";
import Image from "next/image";
import { LiveBadge, RaceTag, TierBadge, WinRateBar, type Race } from "./ui/nzu-badges";
import type { Player } from "@/types";
import { buildPlayerHref } from "@/lib/player-route";

export function PlayerCard({ player }: { player: Player }) {
  return (
    <Link href={buildPlayerHref(player)}>
      <div className="
        relative flex flex-col bg-card rounded-xl border border-border
        overflow-hidden card-hover cursor-pointer group
      ">
        <div className={`
          h-0.5 w-full
          ${player.race === "T" ? "bg-terran" : player.race === "Z" ? "bg-zerg" : "bg-protoss"}
        `} />

        {/* LIVE 배지 */}
        {player.is_live && (
          <div className="absolute top-3 right-3 z-10">
            <LiveBadge />
          </div>
        )}

        {/* 프로필 이미지 */}
        <div className="relative aspect-square w-full bg-muted/20 overflow-hidden">
          {player.photo_url ? (
            <Image
              src={player.photo_url}
              alt={player.name}
              fill
              className="object-cover object-top group-hover:scale-105 transition-transform duration-300"
              sizes="(max-width: 640px) 50vw, (max-width: 1024px) 25vw, 16vw"
            />
          ) : (
            <div className="w-full h-full flex items-center justify-center text-4xl text-muted-foreground/30">
              {player.name[0]}
            </div>
          )}
          {/* 하단 그라데이션 오버레이 */}
          <div className="absolute inset-x-0 bottom-0 h-1/2 bg-gradient-to-t from-card/80 to-transparent" />
        </div>

        {/* 정보 영역 */}
        <div className="p-3 flex flex-col gap-2">
          {/* 이름 + 종족 */}
          <div className="flex items-center justify-between gap-1">
            <span className="font-bold text-sm text-foreground truncate">{player.name}</span>
            <RaceTag race={player.race as Race} size="xs" />
          </div>

          {/* 티어 */}
          <div className="flex items-center justify-between">
            <TierBadge tier={player.tier} rank={player.tier_rank ?? undefined} />
            {player.elo_point !== null && player.elo_point > 0 && (
                <span className="text-[10px] font-bold text-nzu-gold">
                    {player.elo_point} <span className="text-[8px] opacity-60">점</span>
                </span>
            )}
          </div>

          {/* 승률 */}
          <WinRateBar wins={player.total_wins ?? 0} losses={player.total_losses ?? 0} />

          {/* 전적 수치 */}
          <div className="text-[11px] text-muted-foreground text-right font-mono">
            {player.total_wins ?? 0}승 {player.total_losses ?? 0}패
          </div>
        </div>
      </div>
    </Link>
  );
}

/** 가로형 선수 행 (테이블/리스트용) */
export function PlayerRow({ player, rank }: { player: Player; rank?: number }) {
  return (
    <Link href={buildPlayerHref(player)}>
      <div className="
        grid grid-cols-[3rem_2fr_1fr_1fr_1fr] items-center px-4 py-3
        border-l-2 border-l-transparent hover:border-l-nzu-green
        hover:bg-nzu-green/5 transition-all cursor-pointer group
      " style={{ borderLeftColor: player.race === "T" ? "var(--terran)" : player.race === "Z" ? "var(--zerg)" : "var(--protoss)" }}>
        {/* 순위 */}
        <span className="text-xs font-mono text-muted-foreground text-center flex-shrink-0">
          {rank !== undefined ? String(rank).padStart(2, '0') : '--'}
        </span>

        {/* 프로필 + 이름 */}
        <div className="flex items-center gap-3 min-w-0">
          <div className="relative w-8 h-8 rounded-full overflow-hidden bg-muted/20 flex-shrink-0 border border-border/40">
            {player.photo_url ? (
              <Image src={player.photo_url} alt={player.name} fill className="object-cover" sizes="32px" />
            ) : (
              <div className="w-full h-full flex items-center justify-center text-[10px] text-muted-foreground/50">
                {player.name[0]}
              </div>
            )}
            {player.is_live && (
              <div className="absolute -bottom-0.5 -right-0.5 w-2 h-2 rounded-full bg-nzu-live border border-background live-dot" />
            )}
          </div>
          <div className="flex flex-col min-w-0">
            <div className="flex items-center gap-2">
              <span className="font-bold text-sm text-foreground group-hover:text-nzu-green transition-colors truncate">
                {player.name}
              </span>
              <RaceTag race={player.race as Race} size="xs" />
            </div>
            <TierBadge tier={player.tier} rank={player.tier_rank ?? undefined} />
          </div>
        </div>

        {/* 승률 */}
        <div className="flex justify-center">
            <div className="w-16">
                <WinRateBar wins={player.total_wins ?? 0} losses={player.total_losses ?? 0} />
            </div>
        </div>

        {/* ELO */}
        <div className="flex justify-center">
            <span className="text-xs font-bold text-nzu-gold">
                {player.elo_point || 0} <span className="text-[10px] opacity-40 italic">LP</span>
            </span>
        </div>

        {/* 전적 */}
        <div className="text-[11px] font-mono text-muted-foreground text-right flex flex-col items-end">
          <div className="flex gap-1">
             <span className="text-nzu-green font-bold">{player.total_wins ?? 0}승</span>
             <span className="text-destructive font-bold">{player.total_losses ?? 0}패</span>
          </div>
          <span className="text-[9px] opacity-40">누적 { (player.total_wins ?? 0) + (player.total_losses ?? 0) }경기</span>
        </div>
      </div>
    </Link>
  );
}
