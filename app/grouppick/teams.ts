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

/** 실제 조편성 결과(2026-08-03 추첨 확정). 채점 기준이다. */
export const ANSWER: Record<GroupKey, string[]> = {
  A: ["KMS", "HM", "MBU"],
  B: ["NCS", "BGM", "JSA"],
  C: ["KU", "WFU", "DM"],
  D: ["SSU", "SSG", "HKA"],
};

/** 조 하나의 팀 3개를 순서 무관하게 비교하기 위한 키 */
export const setKey = (codes: string[]) => [...codes].sort().join(",");

const NAME_BY_CODE = new Map(TEAMS.map((team) => [team.code, team.name]));

export function teamName(code: string): string {
  return NAME_BY_CODE.get(code) ?? code;
}

export function isTeamCode(code: string): boolean {
  return NAME_BY_CODE.has(code);
}
