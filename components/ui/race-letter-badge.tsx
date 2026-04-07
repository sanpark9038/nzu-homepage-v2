import { cn } from "@/lib/utils";

function normalizeRaceLetter(race: string) {
  const raw = String(race || "").trim().toUpperCase();
  if (raw.startsWith("T")) return "T";
  if (raw.startsWith("Z")) return "Z";
  if (raw.startsWith("P")) return "P";
  return "T";
}

export function RaceLetterBadge({
  race,
  size = "md",
  className,
}: {
  race: string;
  size?: "sm" | "md" | "lg" | "xl";
  className?: string;
}) {
  const r = normalizeRaceLetter(race);
  const configs: Record<string, { color: string; bg: string; border: string }> = {
    T: { color: "text-terran", bg: "bg-terran/10", border: "border-terran/20" },
    Z: { color: "text-zerg", bg: "bg-zerg/10", border: "border-zerg/20" },
    P: { color: "text-protoss", bg: "bg-protoss/10", border: "border-protoss/20" },
  };
  const sizes = {
    sm: "min-w-[24px] h-6 px-1 text-[12px] rounded-md",
    md: "min-w-[30px] h-7 px-1.5 text-[13px] rounded-md",
    lg: "min-w-[36px] h-8 px-2 text-[14px] rounded-lg",
    xl: "min-w-[48px] h-10 px-3 text-[18px] rounded-xl border-2",
  };
  const cfg = configs[r] || configs.T;

  return (
    <span
      className={cn(
        "inline-flex items-center justify-center border font-black leading-none shrink-0",
        cfg.color,
        cfg.bg,
        cfg.border,
        sizes[size],
        className
      )}
    >
      {r}
    </span>
  );
}
