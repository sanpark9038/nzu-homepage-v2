/** 종족 코드 T/Z/P → 한국어 + 색상 */
export type Race = "T" | "Z" | "P";
import { RaceLetterBadge } from "./race-letter-badge";

export function RaceTag({ race, size = "sm" }: { race: Race; size?: "xs" | "sm" | "md" | "lg" }) {
  const mappedSize = {
    xs: "sm",
    sm: "md",
    md: "lg",
    lg: "xl",
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
      방송중
    </span>
  );
}

/** 티어 배지 */
const tierLabels: Record<string, { label: string; color: string; hex: string }> = {
  '갓': { label: "갓", color: "text-amber-200 bg-amber-500/12 border-amber-400/32", hex: "#fbbf24" },
  '킹': { label: "킹", color: "text-orange-300 bg-orange-500/12 border-orange-400/30", hex: "#fb923c" },
  '잭': { label: "잭", color: "text-rose-200 bg-rose-500/14 border-rose-300/34", hex: "#fecdd3" },
  '퀸': { label: "퀸", color: "text-fuchsia-200 bg-fuchsia-500/14 border-fuchsia-300/34", hex: "#f5d0fe" },
  '조커': { label: "조커", color: "text-red-200 bg-red-500/14 border-red-300/34", hex: "#fecaca" },
  '스페이드': { label: "스페이드", color: "text-violet-200 bg-violet-500/14 border-violet-300/34", hex: "#ddd6fe" },
  "0": { label: "0티어", color: "text-emerald-200 bg-emerald-500/12 border-emerald-400/30", hex: "#6ee7b7" },
  "1": { label: "1티어", color: "text-cyan-200 bg-cyan-500/12 border-cyan-400/28", hex: "#67e8f9" },
  "2": { label: "2티어", color: "text-sky-200 bg-sky-500/14 border-sky-300/30", hex: "#7dd3fc" },
  "3": { label: "3티어", color: "text-blue-200 bg-blue-500/14 border-blue-300/30", hex: "#93c5fd" },
  "4": { label: "4티어", color: "text-indigo-200 bg-indigo-500/14 border-indigo-300/30", hex: "#c7d2fe" },
  "5": { label: "5티어", color: "text-slate-200 bg-slate-500/14 border-slate-300/28", hex: "#e2e8f0" },
  "6": { label: "6티어", color: "text-green-300 bg-green-500/12 border-green-400/28", hex: "#86efac" },
  "7": { label: "7티어", color: "text-lime-300 bg-lime-500/12 border-lime-400/28", hex: "#bef264" },
  "8": { label: "8티어", color: "text-yellow-200 bg-yellow-500/14 border-yellow-300/32", hex: "#fde68a" },
  '베이비': { label: "베이비", color: "text-stone-100 bg-stone-700/24 border-stone-400/24", hex: "#f5f5f4" },
  '미정':  { label: "미정",  color: "text-white/20 bg-white/5 border-white/10", hex: "#64748b" },
};

import { normalizeTier, getTierLabel } from "@/lib/utils";

export function getTierTone(tier: string | null | undefined) {
  const norm = normalizeTier(tier);
  const cfg = tierLabels[norm];
  return cfg || {
    label: getTierLabel(tier),
    color: "text-muted-foreground bg-muted/30 border-border",
    hex: "#64748b",
  };
}

export function TierBadge({ tier, rank, size = "sm" }: { tier: string; rank?: number; size?: "xs" | "sm" | "md" | "lg" }) {
  const cfg = getTierTone(tier);


  
  const sizeClasses = {
    xs: "text-[11px] px-1.5 py-0.5",
    sm: "text-xs px-2 py-0.5",
    md: "text-base px-3 py-1",
    lg: "h-10 px-4 text-[18px] rounded-xl border-2 leading-none",
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
