import { normalizeTier, getTierLabel, cn } from "@/lib/utils";
import { RaceLetterBadge } from "./race-letter-badge";

export type Race = "T" | "Z" | "P";

export function RaceTag({ race, size = "sm" }: { race: Race; size?: "xs" | "sm" | "md" | "lg" }) {
  const mappedSize = {
    xs: "sm",
    sm: "md",
    md: "lg",
    lg: "xl",
  } as const;

  return <RaceLetterBadge race={race} size={mappedSize[size]} />;
}

export function LiveBadge() {
  return (
    <span className="inline-flex items-center gap-1 rounded bg-nzu-live/90 px-1.5 py-0.5 text-[11px] font-bold text-white">
      <span className="live-dot h-1.5 w-1.5 rounded-full bg-white" />
      LIVE
    </span>
  );
}

const tierLabels: Record<string, { label: string; color: string; hex: string }> = {
  갓: { label: "갓", color: "text-amber-100 bg-amber-500/18 border-amber-300/70", hex: "#fbbf24" },
  킹: { label: "킹", color: "text-orange-100 bg-orange-500/16 border-orange-300/68", hex: "#fb923c" },
  잭: { label: "잭", color: "text-violet-100 bg-violet-500/18 border-violet-300/72", hex: "#a78bfa" },
  조커: { label: "조커", color: "text-emerald-100 bg-emerald-500/18 border-emerald-300/72", hex: "#34d399" },
  스페이드: { label: "스페이드", color: "text-cyan-100 bg-cyan-500/18 border-cyan-300/72", hex: "#22d3ee" },
  "0": { label: "0티어", color: "text-teal-100 bg-teal-500/18 border-teal-300/72", hex: "#2dd4bf" },
  "1": { label: "1티어", color: "text-sky-100 bg-sky-500/18 border-sky-300/72", hex: "#38bdf8" },
  "2": { label: "2티어", color: "text-blue-100 bg-blue-500/18 border-blue-300/72", hex: "#60a5fa" },
  "3": { label: "3티어", color: "text-indigo-100 bg-indigo-500/18 border-indigo-300/72", hex: "#818cf8" },
  "4": { label: "4티어", color: "text-fuchsia-100 bg-fuchsia-500/18 border-fuchsia-300/72", hex: "#e879f9" },
  "5": { label: "5티어", color: "text-pink-100 bg-pink-500/18 border-pink-300/72", hex: "#f472b6" },
  "6": { label: "6티어", color: "text-rose-100 bg-rose-500/18 border-rose-300/72", hex: "#fb7185" },
  "7": { label: "7티어", color: "text-lime-100 bg-lime-500/18 border-lime-300/72", hex: "#a3e635" },
  "8": { label: "8티어", color: "text-yellow-100 bg-yellow-500/18 border-yellow-300/72", hex: "#facc15" },
  "9": { label: "베이비", color: "text-stone-100 bg-stone-500/22 border-stone-300/64", hex: "#d6d3d1" },
  미정: { label: "미정", color: "text-white/70 bg-white/8 border-white/20", hex: "#94a3b8" },
};

export function getTierTone(tier: string | null | undefined) {
  const normalized = normalizeTier(tier);
  const config = tierLabels[normalized];

  return (
    config || {
      label: getTierLabel(tier),
      color: "text-muted-foreground bg-muted/30 border-border",
      hex: "#64748b",
    }
  );
}

export function TierBadge({
  tier,
  rank,
  size = "sm",
  className,
}: {
  tier: string;
  rank?: number;
  size?: "xs" | "sm" | "md" | "lg";
  className?: string;
}) {
  const config = getTierTone(tier);

  const sizeClasses = {
    xs: "text-[11px] px-1.5 py-0.5 rounded-md",
    sm: "text-[11px] px-2 py-[0.35rem] rounded-lg",
    md: "text-base px-3 py-1 rounded-xl",
    lg: "h-10 px-4 text-[18px] rounded-xl border-2 leading-none",
  };

  return (
    <span
      className={cn(
        "inline-flex items-center justify-center gap-1 border font-black transition-all whitespace-nowrap",
        config.color,
        sizeClasses[size],
        className
      )}
    >
      {config.label}
      {rank !== undefined && <span className="ml-0.5 opacity-60">#{rank}</span>}
    </span>
  );
}

export function WinRateBar({ wins, losses }: { wins: number; losses: number }) {
  const total = wins + losses;
  const rate = total === 0 ? 0 : Math.round((wins / total) * 100);
  const rateColor = rate >= 60 ? "bg-nzu-green" : rate >= 50 ? "bg-teal-500" : rate >= 40 ? "bg-yellow-500" : "bg-red-500";

  return (
    <div className="flex items-center gap-2">
      <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-muted/40">
        <div className={`h-full rounded-full transition-all ${rateColor}`} style={{ width: `${rate}%` }} />
      </div>
      <span className={`min-w-[36px] text-right text-xs font-mono font-semibold ${rateColor.replace("bg-", "text-")}`}>{rate}%</span>
    </div>
  );
}

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
    <div className="flex items-center gap-3 rounded-lg border border-border bg-card px-4 py-3">
      <span className="text-xl">{icon}</span>
      <div>
        <div className="text-lg font-bold leading-none text-foreground">{value}</div>
        <div className="mt-0.5 text-xs text-muted-foreground">{label}</div>
      </div>
    </div>
  );
}
