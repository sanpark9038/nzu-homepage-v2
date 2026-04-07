
import Link from "next/link";
import Image from "next/image";
import { RaceTag, TierBadge, WinRateBar, type Race } from "../ui/nzu-badges";
import { Player } from "./PlayerCard";
import { buildPlayerHref } from "@/lib/player-route";

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
            <span className="text-sm font-bold text-nzu-gold">
                {player.elo_point || 0} <span className="text-xs opacity-60">점</span>
            </span>
        </div>

        {/* 전적 */}
        <div className="text-xs font-bold text-muted-foreground text-right flex flex-col items-end">
          <div className="flex gap-1">
             <span className="text-nzu-green">{player.total_wins ?? 0}승</span>
             <span className="text-destructive">{player.total_losses ?? 0}패</span>
          </div>
          <span className="text-[11px] opacity-50">누적 { (player.total_wins ?? 0) + (player.total_losses ?? 0) }경기</span>
        </div>
      </div>
    </Link>
  );
}
