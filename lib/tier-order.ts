import { normalizeTier } from "./utils";

const SHARED_TIER_ORDER: Record<string, number> = {
  갓: 0,
  킹: 1,
  잭: 2,
  조커: 3,
  스페이드: 4,
  "0": 5,
  "1": 6,
  "2": 7,
  "3": 8,
  "4": 9,
  "5": 10,
  "6": 11,
  "7": 12,
  "8": 13,
  "9": 14,
  미정: 99,
};

export function getTierSortWeight(tier: string | null | undefined): number {
  return SHARED_TIER_ORDER[normalizeTier(tier)] ?? 50;
}
