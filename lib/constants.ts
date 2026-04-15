
export const SITE_CONFIG = {
  REVALIDATE_TIME: 60, // 60초마다 데이터 재생성 (ISR)
  SEASON: "시즌 1",
  UNIVERSITY_NAME: "호사가 (HOSAGA)",
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
};

export const REAL_NAME_MAP: Record<string, string> = {
  '구라미스': '김성민',
  '기뉴다': '박현재',
  '샤이니': '김재현',
  '미동미동': '박준영',
  '액션구드론': '김동민',
  '초난강': '우규민'
};

export const TIERS = ["GOD", "KING", "JACK", "QUEEN", "JOKER", "스페이드", "0", "1", "2", "3", "4", "5", "6", "7", "8", "BABY", "미정"] as const;


export type Tiers = typeof TIERS[number];
