// 중만컵 조편성 예측(방송 1회성) 전용 팀 데이터.
// 의도적으로 자족적이다 — 파이프라인·jungman 데이터에 의존하지 않으므로 방송이 끝나면 폴더째 지우면 된다.

export type Team = { code: string; name: string };

export const TEAMS: Team[] = [
  { code: "KMS", name: "캄몬스타즈" },
  { code: "NCS", name: "뉴캣슬" },
  { code: "JSA", name: "JSA" },
  { code: "SSU", name: "수술대" },
  { code: "KU", name: "케이대" },
  { code: "HKA", name: "흑카데미" },
  { code: "BGM", name: "BGM" },
  { code: "DM", name: "DM" },
  { code: "HM", name: "HM" },
  { code: "SSG", name: "신세계" },
  { code: "MBU", name: "엠비대" },
  { code: "WFU", name: "와플대" },
];

export const GROUPS = ["A", "B", "C", "D"] as const;
export type GroupKey = (typeof GROUPS)[number];

// 각 조 1번 고정 시드. 인기투표 3위 접전이라 방송 전에 바뀔 수 있다 — 바뀌면 여기만 고친다.
export const SEEDS: Record<GroupKey, string> = {
  A: "KMS", // 인기투표 1위
  B: "NCS", // 2위
  C: "JSA", // 3위
  D: "SSU", // 시드권
};

const SEED_CODES = new Set(Object.values(SEEDS));

/** 시청자가 직접 배치하는 8팀 (조당 2슬롯 × 4조) */
export const FREE_TEAMS = TEAMS.filter((team) => !SEED_CODES.has(team.code));

const NAME_BY_CODE = new Map(TEAMS.map((team) => [team.code, team.name]));

export function teamName(code: string): string {
  return NAME_BY_CODE.get(code) ?? code;
}

export function isTeamCode(code: string): boolean {
  return NAME_BY_CODE.has(code);
}
