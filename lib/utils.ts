import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export function calculateWinRate(wins: number | null, losses: number | null): number {
  const total = (wins ?? 0) + (losses ?? 0);
  if (total === 0) return 0;
  return Math.round(((wins ?? 0) / total) * 100);
}

export const UNKNOWN_TIER = "미정";

const TIER_ALIASES: Record<string, string> = {
  god: "갓",
  갓: "갓",
  king: "킹",
  킹: "킹",
  jack: "잭",
  잭: "잭",
  queen: "조커",
  joker: "조커",
  조커: "조커",
  spade: "스페이드",
  스페이드: "스페이드",
  baby: "9",
  베이비: "9",
  "9티어": "9",
  "n/a": UNKNOWN_TIER,
  unknown: UNKNOWN_TIER,
  미정: UNKNOWN_TIER,
};

export function normalizeTier(tier: string | null | undefined): string {
  if (!tier || tier === "null") return UNKNOWN_TIER;

  const raw = String(tier).trim();
  const normalized = raw.toLowerCase();

  if (TIER_ALIASES[normalized]) return TIER_ALIASES[normalized];

  const numericTier = normalized.match(/^\d+$/);
  if (numericTier) return numericTier[0];

  return raw;
}

export function getTierLabel(tier: string | null | undefined): string {
  const normalized = normalizeTier(tier);

  if (normalized === UNKNOWN_TIER) return UNKNOWN_TIER;
  if (["갓", "킹", "잭", "조커", "스페이드"].includes(normalized)) return normalized;
  if (normalized === "9") return "베이비";
  if (!Number.isNaN(Number(normalized))) return `${normalized}티어`;

  return normalized;
}

export function normalizeRace(race: string | null | undefined): "T" | "Z" | "P" {
  if (!race) return "T";

  const normalized = race.toUpperCase().substring(0, 1);
  if (normalized === "T" || normalized === "Z" || normalized === "P") {
    return normalized as "T" | "Z" | "P";
  }

  return "T";
}

export function formatTimeAgo(dateString: string | null | undefined): string {
  if (!dateString) return "";

  try {
    const date = new Date(dateString);
    if (Number.isNaN(date.getTime())) return "";

    const now = new Date();
    const diffInSeconds = Math.floor((now.getTime() - date.getTime()) / 1000);

    if (diffInSeconds < 60) return "방금 전";

    const diffInMinutes = Math.floor(diffInSeconds / 60);
    if (diffInMinutes < 60) return `${diffInMinutes}분 전`;

    const diffInHours = Math.floor(diffInMinutes / 60);
    if (diffInHours < 24) return `${diffInHours}시간 전`;

    const diffInDays = Math.floor(diffInHours / 24);
    if (diffInDays < 30) return `${diffInDays}일 전`;

    return date.toLocaleDateString("ko-KR").replace(/\. /g, ".").replace(/\.$/, "");
  } catch {
    return "";
  }
}
