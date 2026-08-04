/**
 * 중만컵 조별 순위 — site_settings의 jungman_standings 한 칸이 원본이다.
 * 관리자가 손으로 넣는 JSON이라 파싱은 방어적으로, 계산은 순수 함수로 여기서 끝낸다.
 */

export const JUNGMAN_STANDINGS_KEY = "jungman_standings";

/** 한 세트. 종족은 저장하지 않는다 — 선수 이름에서 나중에 찾는다(raceOfName). */
export type JungmanStandingsSet = {
  map: string;
  /** 홈팀 선수 이름 */
  home: string;
  /** 원정팀 선수 이름 */
  away: string;
  /** 아직 안 끝난 세트는 null */
  winner: "home" | "away" | null;
};

export type JungmanStandingsMatch = {
  group: string;
  home: string;
  away: string;
  homeSets: number;
  awaySets: number;
  sets?: JungmanStandingsSet[];
  /** 경기일 YYYY-MM-DD (한국 날짜). 순위 계산에는 안 쓰고 나중에 최신순 정렬에만 쓴다. */
  date?: string;
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
 * 세트 승자 수가 곧 경기 점수다. 관리자 화면과 파서가 같은 함수를 불러야 둘이 안 갈라진다.
 * 승자가 null인 세트(진행 중)는 어느 쪽에도 안 센다.
 */
export function setScoreOf(sets: JungmanStandingsSet[]): { home: number; away: number } {
  return {
    home: sets.filter((s) => s.winner === "home").length,
    away: sets.filter((s) => s.winner === "away").length,
  };
}

/** 세트 배열을 방어적으로 읽는다. 살아남은 게 없으면 undefined — 빈 줄이 쌓이면 세트 수가 거짓이 된다. */
function parseSets(value: unknown): JungmanStandingsSet[] | undefined {
  if (!Array.isArray(value)) return undefined;
  const sets: JungmanStandingsSet[] = [];
  for (const entry of value) {
    const set = (entry || {}) as Record<string, unknown>;
    const map = text(set.map);
    const home = text(set.home);
    const away = text(set.away);
    const winner = set.winner === "home" || set.winner === "away" ? set.winner : null;
    // 맵·선수·승자가 다 없는 빈 줄만 버린다. 승자가 찍혀 있으면 치른 세트다 —
    // 관리자가 급할 때 이름 없이 승자만 찍으므로, 여기서 버리면 그 승수가 점수에서 빠진다.
    if (!map && !home && !away && !winner) continue;
    sets.push({ map, home, away, winner });
  }
  return sets.length ? sets : undefined;
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
    if (!group || !home || !away || home === away) continue;

    // 세트가 있으면 저장된 점수는 무시한다 — 사람이 두 곳에 적으면 반드시 어긋난다
    const sets = parseSets(match.sets);
    let homeSets: number | null;
    let awaySets: number | null;
    if (sets) {
      ({ home: homeSets, away: awaySets } = setScoreOf(sets));
    } else {
      homeSets = count(match.homeSets);
      awaySets = count(match.awaySets);
      if (homeSets === null || awaySets === null) continue;
    }

    // 형식이 어긋난 날짜는 없는 것으로 친다 — 정렬이 조용히 뒤엉키는 것보다 낫다
    const date = /^\d{4}-\d{2}-\d{2}$/.test(text(match.date)) ? text(match.date) : undefined;

    // 무승부가 없는 종목이다 — 세트가 같으면 아직 안 끝난 경기로 보고 집계에서 뺀다(0:0 예정 포함)
    if (homeSets === awaySets) continue;
    matches.push({
      group,
      home,
      away,
      homeSets,
      awaySets,
      ...(sets ? { sets } : {}),
      ...(date ? { date } : {}),
    });
  }

  return { announced: true, groups, matches };
}

/**
 * 최신 경기가 위. 날짜 없는 경기는 맨 뒤로.
 * 안정 정렬(ES2019)이라 같은 날짜끼리·날짜 없는 것끼리는 입력 순서가 그대로 남는다.
 */
export function sortJungmanMatches(matches: JungmanStandingsMatch[]): JungmanStandingsMatch[] {
  // 원본을 뒤집지 않는다 — 순위 계산이 같은 배열을 본다
  return matches.slice().sort((a, b) => {
    if (!a.date || !b.date) return a.date ? -1 : b.date ? 1 : 0;
    return b.date.localeCompare(a.date);
  });
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
