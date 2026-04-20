export const SITE_CONFIG = {
  REVALIDATE_TIME: 60,
  SEASON: "호사가 시즌 1",
  UNIVERSITY_NAME: "호서대 스타 아카데미 (HOSAGA)",
  SOOP_CH_URL: "https://ch.sooplive.co.kr",
  ELOBOARD_URL: "https://eloboard.com",
};

export const RACE_COLORS = {
  T: "var(--terran)",
  Z: "var(--zerg)",
  P: "var(--protoss)",
};

export const TIER_COLORS: Record<string, string> = {
  "1": "from-red-600 to-red-400",
  "2": "from-orange-600 to-orange-400",
  "3": "from-yellow-600 to-yellow-400",
  "4": "from-green-600 to-green-400",
  "5": "from-blue-600 to-blue-400",
  "6": "from-purple-600 to-purple-400",
  "7": "from-gray-600 to-gray-400",
  "8": "from-slate-600 to-slate-400",
  "9": "from-stone-500 to-stone-300",
};

// Keep this sparse. The primary fallback path should be player name + nickname.
export const REAL_NAME_MAP: Record<string, string> = {};

export const TIERS = [
  "GOD",
  "KING",
  "JACK",
  "JOKER",
  "SPADE",
  "0",
  "1",
  "2",
  "3",
  "4",
  "5",
  "6",
  "7",
  "8",
  "9",
  "UNKNOWN",
] as const;

export type Tiers = (typeof TIERS)[number];
