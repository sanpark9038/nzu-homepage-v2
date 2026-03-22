
'use client'

import Link from "next/link";
import Image from "next/image";
import { LiveBadge, RaceTag, TierBadge, WinRateBar, type Race } from "../ui/nzu-badges";
import { Database } from "@/lib/database.types";
import { cn } from "@/lib/utils";

export type Player = Database['public']['Tables']['players']['Row'];

interface PlayerCardProps {
  player: Player
  layout?: 'default' | 'compact'
  className?: string
}


export function PlayerCard({ player, layout = 'default', className }: PlayerCardProps) {
  const isCompact = layout === 'compact';
  const race = (player.race || "T") as Race;


  // 종족별 테마 스타일 정의 (프리미엄 소프트 그라디언트 적용)
  const raceStyles = {
    T: {
      border: "hover:border-terran/30",
      text: "group-hover:text-terran",
      accent: "bg-terran",
      glow: "rgba(74, 158, 255, 0.12)",
      line: "bg-gradient-to-r from-transparent via-terran/80 to-transparent",
    },
    Z: {
      border: "hover:border-zerg/30",
      text: "group-hover:text-zerg",
      accent: "bg-zerg",
      glow: "rgba(168, 85, 247, 0.12)",
      line: "bg-gradient-to-r from-transparent via-zerg/80 to-transparent",
    },
    P: {
      border: "hover:border-protoss/30",
      text: "group-hover:text-protoss",
      accent: "bg-protoss",
      glow: "rgba(255, 215, 0, 0.12)",
      line: "bg-gradient-to-r from-transparent via-protoss/80 to-transparent",
    },
  }[race];

  return (
    <Link href={`/player/${player.id}`} className={cn("block group cursor-pointer", isCompact ? "w-full" : "", className)}>
      <div className={cn(
        "relative flex rounded-[2rem] border transition-all duration-700 overflow-hidden shadow-2xl group",
        isCompact 
          ? `bg-[#0A100D]/80 backdrop-blur-md border-white/5 ${raceStyles.border} p-3 items-center gap-4 flex-row h-24` 
          : `bg-[#0F1412] flex-col border-white/5 ${raceStyles.border} hover:bg-[#121815] hover:-translate-y-2`
      )}>
        {/* === Premium Soft Glow Layer === */}
        <div 
          className="absolute inset-0 opacity-0 group-hover:opacity-100 transition-opacity duration-1000 pointer-events-none"
          style={{ 
            background: `radial-gradient(circle at 50% 0%, ${raceStyles.glow} 0%, transparent 70%)` 
          }} 
        />

        {/* Race Color Accent (Soft Fading Line) */}
        <div className={cn(
          "absolute top-0 left-0 w-full h-[2px] transition-all duration-700 opacity-0 group-hover:opacity-100 z-20",
          raceStyles.line
        )} />

        {/* Profile Image Area */}
        <div className={cn(
          "relative bg-[#050706] overflow-hidden rounded-[1.5rem] z-10",
          isCompact ? "w-16 h-16 shrink-0 aspect-square" : "aspect-[4/5] w-full"
        )}>
          {player.photo_url ? (
            <Image
              src={player.photo_url}
              alt={player.name}
              fill
              className="object-cover object-top opacity-70 group-hover:opacity-100 group-hover:scale-110 transition-all duration-700 ease-out"
              sizes="(max-width: 640px) 50vw, (max-width: 1024px) 25vw, 16vw"
            />
          ) : (
            <div className="w-full h-full flex items-center justify-center bg-black/40">
               <span className="text-xl font-black text-white/5">{player.name[0]}</span>
            </div>
          )}
          
          {player.is_live && (
            <div className={cn("absolute z-30", isCompact ? "top-1 right-1 scale-75" : "top-4 right-4")}>
              <LiveBadge />
            </div>
          )}
          
          {!isCompact && <div className="absolute inset-x-0 bottom-0 h-1/2 bg-gradient-to-t from-[#0F1412] to-transparent z-10" />}
        </div>

        {/* Info Content */}
        <div className={cn(
          "flex-1 flex flex-col justify-center",
          isCompact ? "pr-4" : "p-6 gap-4"
        )}>
          <div className="flex items-center justify-between">
            <span className={cn(
              "font-black text-white transition-colors leading-tight",
              raceStyles.text,
              isCompact ? "text-base" : "text-2xl"
            )}>{player.name}</span>
            <RaceTag race={race} size={isCompact ? "xs" : "sm"} />
          </div>

          <div className={cn(
            "flex items-center justify-between",
            !isCompact && "border-t border-white/5 pt-4"
          )}>
            <TierBadge tier={player.tier} size={isCompact ? "xs" : "sm"} />
            {player.elo_point !== null && (
              <span className={cn(
                "font-black text-nzu-gold tabular-nums",
                isCompact ? "text-[11px]" : "text-base"
              )}>
                {player.elo_point.toLocaleString()} <span className="text-[10px] opacity-40 ml-0.5 tracking-tighter">점</span>
              </span>
            )}
          </div>

          {!isCompact && (
            <div className="space-y-2 mt-2">
              <div className="flex justify-between text-[11px] font-black uppercase tracking-widest text-white/20">
                 <span>승률</span>
                 <span className="text-white/60">{player.total_wins ?? 0}승 {player.total_losses ?? 0}패</span>
              </div>
              <WinRateBar wins={player.total_wins ?? 0} losses={player.total_losses ?? 0} />
            </div>
          )}
        </div>
      </div>
    </Link>
  );
}

