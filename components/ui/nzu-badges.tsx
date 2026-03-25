/** 종족 코드 T/Z/P → 한국어 + 색상 */
export type Race = "T" | "Z" | "P";
import { RaceLetterBadge } from "./race-letter-badge";

export function RaceTag({ race, size = "sm" }: { race: Race; size?: "xs" | "sm" | "md" }) {
  const mappedSize = {
    xs: "sm",
    sm: "md",
    md: "lg",
  } as const;

  return (
    <RaceLetterBadge race={race} size={mappedSize[size]} />
  );
}

/** LIVE 배지 */
export function LiveBadge() {
  return (
    <span className="inline-flex items-center gap-1 text-[11px] font-bold text-white bg-nzu-live/90 px-1.5 py-0.5 rounded">
      <span className="w-1.5 h-1.5 rounded-full bg-white live-dot" />
      ON AIR
    </span>
  );
}

/** 티어 배지 */
const tierLabels: Record<string, { label: string; color: string }> = {
  '갓':  { label: "갓",   color: "text-yellow-300 bg-yellow-400/10 border-yellow-400/30" },
  '킹':  { label: "킹",   color: "text-orange-400 bg-orange-400/10 border-orange-400/30" },
  '잭':  { label: "잭",   color: "text-blue-400 bg-blue-400/10 border-blue-400/30" },
  '조커': { label: "조커", color: "text-purple-400 bg-purple-400/10 border-purple-400/30" },
  '스페이드': { label: "스페이드", color: "text-slate-300 bg-slate-400/10 border-slate-400/30" },
  "0":   { label: "0티어", color: "text-nzu-green/90 bg-nzu-green/10 border-nzu-green/40" },
  "1":   { label: "1티어", color: "text-nzu-green bg-nzu-green/10 border-nzu-green/30" },
  "2":   { label: "2티어", color: "text-nzu-green/80 bg-nzu-green/8 border-nzu-green/20" },
  "3":   { label: "3티어", color: "text-emerald-500 bg-emerald-500/10 border-emerald-500/20" },
  "4":   { label: "4티어", color: "text-teal-500 bg-teal-500/10 border-teal-500/20" },
  "5":   { label: "5티어", color: "text-cyan-500 bg-cyan-500/10 border-cyan-500/20" },
  "6":   { label: "6티어", color: "text-sky-400 bg-sky-400/10 border-sky-400/20" },
  "7":   { label: "7티어", color: "text-slate-400 bg-slate-400/10 border-slate-400/20" },
  "8":   { label: "8티어", color: "text-slate-500 bg-slate-500/10 border-slate-500/20" },
  '아기':  { label: "BABY",  color: "text-pink-400 bg-pink-400/10 border-pink-400/20" },
  '미정':  { label: "미정",  color: "text-white/20 bg-white/5 border-white/10" },
};

import { normalizeTier, getTierLabel } from "@/lib/utils";

export function TierBadge({ tier, rank, size = "sm" }: { tier: string; rank?: number; size?: "xs" | "sm" | "md" | "lg" }) {
  const norm = normalizeTier(tier);
  const cfg = tierLabels[norm] || { 
    label: getTierLabel(tier), 
    color: "text-muted-foreground bg-muted/30 border-border" 
  };


  
  const sizeClasses = {
    xs: "text-[11px] px-1.5 py-0.5",
    sm: "text-xs px-2 py-0.5",
    md: "text-base px-3 py-1",
    lg: "text-xl px-5 py-2.5 rounded-xl border-2",
  };


  return (
    <span className={`inline-flex items-center gap-1 font-bold border rounded transition-all ${cfg.color} ${sizeClasses[size]}`}>
      {cfg.label}
      {rank !== undefined && <span className="opacity-60 ml-0.5">#{rank}</span>}
    </span>
  );
}

/** 승률 게이지 바 */
export function WinRateBar({ wins, losses }: { wins: number; losses: number }) {
  const total = wins + losses;
  const rate = total === 0 ? 0 : Math.round((wins / total) * 100);
  const rateColor = rate >= 60 ? "bg-nzu-green" : rate >= 50 ? "bg-teal-500" : rate >= 40 ? "bg-yellow-500" : "bg-red-500";

  return (
    <div className="flex items-center gap-2">
      <div className="flex-1 h-1.5 bg-muted/40 rounded-full overflow-hidden">
        <div
          className={`h-full rounded-full transition-all ${rateColor}`}
          style={{ width: `${rate}%` }}
        />
      </div>
      <span className={`text-xs font-mono font-semibold min-w-[36px] text-right ${rateColor.replace("bg-", "text-")}`}>
        {rate}%
      </span>
    </div>
  );
}

/** 통계 카운터 카드 (상단 요약용) */
export function StatCounter({
  icon,
  value,
  label,
}: {
  icon: string;
  value: string | number;
  label: string;
}) {
  return (
    <div className="flex items-center gap-3 bg-card rounded-lg border border-border px-4 py-3">
      <span className="text-xl">{icon}</span>
      <div>
        <div className="text-lg font-bold text-foreground leading-none">{value}</div>
        <div className="text-xs text-muted-foreground mt-0.5">{label}</div>
      </div>
    </div>
  );
}
