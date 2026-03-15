
import Link from "next/link";
import Image from "next/image";
import { LiveBadge, RaceTag, TierBadge, WinRateBar, type Race } from "../ui/nzu-badges";
import { Database } from "@/lib/database.types";

export type Player = Database['public']['Tables']['players']['Row'];

export function PlayerCard({ player }: { player: Player }) {
  return (
    <Link href={`/player/${player.id}`}>
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
                    {player.elo_point} <span className="text-[8px] opacity-60">LP</span>
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
