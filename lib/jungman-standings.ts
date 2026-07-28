/**
 * 중만컵 조별 순위 — site_settings의 jungman_standings 한 칸이 원본이다.
 * 관리자가 손으로 넣는 JSON이라 파싱은 방어적으로, 계산은 순수 함수로 여기서 끝낸다.
 */

export const JUNGMAN_STANDINGS_KEY = "jungman_standings";

export type JungmanStandingsMatch = {
  group: string;
  home: string;
  away: string;
  homeSets: number;
  awaySets: number;
};

export type JungmanStandingsGroup = { name: string; teams: string[] };

export type JungmanStandings = {
  announced: true;
  groups: JungmanStandingsGroup[];
  matches: JungmanStandingsMatch[];
};

export type JungmanStandingsRow = {
  team: string;
  wins: number;
  losses: number;
  setsWon: number;
  setDiff: number;
  /** 조 풀리그 기준 남은 경기 수 (3팀 조 = 팀당 2경기) */
  remaining: number;
};

export type JungmanGroupTable = { name: string; rows: JungmanStandingsRow[] };

function text(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function count(value: unknown): number | null {
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed >= 0 ? parsed : null;
}

/**
 * 스키마가 어긋나면 null — 호출부는 "발표 전"과 똑같이 그린다.
 * 화면이 깨지는 것보다 한 칸 비어 보이는 편이 낫다.
 */
export function parseJungmanStandings(raw: string | null | undefined): JungmanStandings | null {
  if (!raw) return null;

  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    console.warn(`${JUNGMAN_STANDINGS_KEY}: JSON 파싱에 실패했습니다`);
    return null;
  }

  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return null;
  const data = parsed as Record<string, unknown>;
  // 발표 전에는 데이터가 있어도 공개하지 않는다 — 편성 미리보기가 새어나가면 안 된다
  if (data.announced !== true) return null;

  const groups: JungmanStandingsGroup[] = [];
  for (const entry of Array.isArray(data.groups) ? data.groups : []) {
    const group = (entry || {}) as { name?: unknown; teams?: unknown };
    const name = text(group.name);
    const teams = (Array.isArray(group.teams) ? group.teams : []).map(text).filter(Boolean);
    if (name && teams.length) groups.push({ name, teams });
  }

  if (!groups.length) {
    console.warn(`${JUNGMAN_STANDINGS_KEY}: 조 편성이 비어 있습니다`);
    return null;
  }

  const matches: JungmanStandingsMatch[] = [];
  for (const entry of Array.isArray(data.matches) ? data.matches : []) {
    const match = (entry || {}) as Record<string, unknown>;
    const group = text(match.group);
    const home = text(match.home);
    const away = text(match.away);
    const homeSets = count(match.homeSets);
    const awaySets = count(match.awaySets);
    if (!group || !home || !away || home === away) continue;
    if (homeSets === null || awaySets === null) continue;
    // 무승부가 없는 종목이다 — 세트가 같으면 아직 안 끝난 경기로 보고 집계에서 뺀다(0:0 예정 포함)
    if (homeSets === awaySets) continue;
    matches.push({ group, home, away, homeSets, awaySets });
  }

  return { announced: true, groups, matches };
}

function applyResult(row: JungmanStandingsRow, won: number, lost: number) {
  row.setsWon += won;
  row.setDiff += won - lost;
  if (won > lost) row.wins += 1;
  else row.losses += 1;
  row.remaining = Math.max(0, row.remaining - 1);
}

/** 승 → 세트득실 → 세트승 → 팀명. 팀명까지 가야 같은 입력이 항상 같은 순서로 나온다. */
function compareRows(a: JungmanStandingsRow, b: JungmanStandingsRow) {
  return (
    b.wins - a.wins ||
    b.setDiff - a.setDiff ||
    b.setsWon - a.setsWon ||
    a.team.localeCompare(b.team, "ko")
  );
}

export function buildJungmanGroupTables(standings: JungmanStandings): JungmanGroupTable[] {
  return standings.groups.map((group) => {
    const rows = new Map<string, JungmanStandingsRow>(
      group.teams.map((team) => [
        team,
        // 풀리그라 팀당 예정 경기 = 조 인원 - 1
        { team, wins: 0, losses: 0, setsWon: 0, setDiff: 0, remaining: group.teams.length - 1 },
      ])
    );

    for (const match of standings.matches) {
      if (match.group !== group.name) continue;
      const home = rows.get(match.home);
      const away = rows.get(match.away);
      // 조에 없는 팀명(오타)은 통째로 버린다 — 한쪽만 반영하면 승패 합이 어긋난다
      if (!home || !away) continue;
      applyResult(home, match.homeSets, match.awaySets);
      applyResult(away, match.awaySets, match.homeSets);
    }

    return { name: group.name, rows: [...rows.values()].sort(compareRows) };
  });
}
