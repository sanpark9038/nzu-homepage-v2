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
  /** 세트 수가 갈렸으면 끝난 경기. 무승부가 없는 종목이라 동점 = 아직 안 끝남(0:0 예정 포함) */
  decided: boolean;
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

    // 안 끝난 경기도 그대로 내보낸다 — 예정 일정을 읽으려면 여기서 버리면 안 된다.
    // 거르는 일은 쓰는 쪽(집계·결과 목록)이 decided로 한다.
    matches.push({
      group,
      home,
      away,
      homeSets,
      awaySets,
      decided: homeSets !== awaySets,
      ...(sets ? { sets } : {}),
      ...(date ? { date } : {}),
    });
  }

  return { announced: true, groups, matches };
}

/**
 * 경기 결과 목록 — 끝난 경기만, 최신 경기가 위. 날짜 없는 경기는 맨 뒤로.
 * 안정 정렬(ES2019)이라 같은 날짜끼리·날짜 없는 것끼리는 입력 순서가 그대로 남는다.
 */
export function sortJungmanMatches(matches: JungmanStandingsMatch[]): JungmanStandingsMatch[] {
  // 원본을 뒤집지 않는다 — 순위 계산이 같은 배열을 본다
  return matches
    .filter((match) => match.decided)
    .sort((a, b) => {
      if (!a.date || !b.date) return a.date ? -1 : b.date ? 1 : 0;
      return b.date.localeCompare(a.date);
    });
}

/** 아직 안 끝났고 날짜가 있는 경기를 가까운 날짜부터. 날짜 없는 예정 경기는 뺀다(언제인지 모르니 못 보여준다) */
export function upcomingJungmanMatches(matches: JungmanStandingsMatch[]): JungmanStandingsMatch[] {
  return matches
    .filter((match) => !match.decided && match.date)
    .sort((a, b) => (a.date as string).localeCompare(b.date as string));
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

export type JungmanPlayerRank = {
  name: string;
  /** 소속 팀 이름 (그 선수가 뛴 경기의 자기 팀). 여러 팀이면 가장 많이 뛴 팀 */
  team: string;
  wins: number;
  losses: number;
};

/** 다승 → 승률 → 이름 순. 이름이 빈 세트(승자만 찍은 것)는 세지 않는다. */
export function buildJungmanPlayerRanks(matches: JungmanStandingsMatch[]): JungmanPlayerRank[] {
  const players = new Map<string, { wins: number; losses: number; teams: Map<string, number> }>();

  const add = (name: string, team: string, won: boolean) => {
    // 관리자가 급할 때 이름 없이 승자만 찍는다 — 그 세트는 선수 전적이 될 수 없다
    if (!name) return;
    let player = players.get(name);
    if (!player) players.set(name, (player = { wins: 0, losses: 0, teams: new Map() }));
    if (won) player.wins += 1;
    else player.losses += 1;
    player.teams.set(team, (player.teams.get(team) ?? 0) + 1);
  };

  for (const match of matches) {
    for (const set of match.sets ?? []) {
      if (set.winner === null) continue;
      add(set.home, match.home, set.winner === "home");
      add(set.away, match.away, set.winner === "away");
    }
  }

  return [...players]
    .map(([name, player]) => ({
      name,
      // 동수면 먼저 나온 팀 — Map은 넣은 순서를 지킨다
      team: [...player.teams].reduce((best, cur) => (cur[1] > best[1] ? cur : best))[0],
      wins: player.wins,
      losses: player.losses,
    }))
    .sort(
      (a, b) =>
        b.wins - a.wins ||
        b.wins / (b.wins + b.losses) - a.wins / (a.wins + a.losses) ||
        a.name.localeCompare(b.name, "ko")
    );
}

/** 조 2위까지 8강. 계산과 화면이 같은 상수를 봐야 진출선이 갈라지지 않는다 */
export const JUNGMAN_ADVANCING = 2;

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
      // 안 끝난 경기(예정 포함)는 승패에도 잔여 감소에도 들어가면 안 된다
      if (!match.decided) continue;
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

// ── 진출 경우의 수 ────────────────────────────────────────────────────────

export type JungmanScenario = {
  team: string;
  /** 남은 모든 경우에서 2위 안에 든다 */
  clinched: boolean;
  /** 남은 모든 경우에서 2위 안에 못 든다 */
  eliminated: boolean;
  /** 이 팀의 다음 경기를 이기면 진출이 확정되는가 */
  winClinches: boolean;
  /** 이 팀의 다음 경기를 지면 탈락이 확정되는가 */
  lossEliminates: boolean;
};

/** 남은 경기 한 건의 결과 가짓수 — 이긴 쪽 2가지 × 진 쪽 세트 0~4가지. 9전 5선승이라 이긴 쪽은 항상 5세트다 */
const OUTCOMES = 10;

/**
 * 전수 조사 상한. 3팀 조는 남은 경기가 최대 3건(1,000가지)이라 순식간이다.
 * 그보다 큰 조(4팀 초반이면 6건 = 100만)는 아무 말도 하지 않는다 — 화면이 멈추는 것보다 침묵이 낫다.
 */
const MAX_PENDING = 4;

/** 날짜 오름차순. 날짜 없는 경기는 맨 뒤 */
const earlierFirst = (a: JungmanStandingsMatch, b: JungmanStandingsMatch) =>
  (a.date ?? "9999-99-99").localeCompare(b.date ?? "9999-99-99");

/**
 * compareRows가 팀명으로만 가르는 사이인가.
 * 공식 4번째 기준은 동률팀 간 승자승인데 우리는 그걸 구현하지 않았다 —
 * 여기까지 같으면 누가 올라갈지 "모르는" 것이다.
 */
const onlyNameApart = (a: JungmanStandingsRow, b: JungmanStandingsRow) =>
  a.wins === b.wins && a.setDiff === b.setDiff && a.setsWon === b.setsWon;

/**
 * 조마다 남은 경기의 모든 결과를 다 돌려 진출/탈락이 확정됐는지 본다.
 * 정렬은 buildJungmanGroupTables와 같은 compareRows를 쓴다 — 계산이 화면과 다르면 거짓말이 된다.
 */
export function buildJungmanScenarios(standings: JungmanStandings): Map<string, JungmanScenario[]> {
  const result = new Map<string, JungmanScenario[]>();

  for (const table of buildJungmanGroupTables(standings)) {
    const teams = table.rows.map((row) => row.team);
    // 조에 없는 팀명(오타)이 낀 경기는 뺀다 — 한쪽만 반영하면 승패 합이 어긋난다(순위표와 같은 규칙)
    const pending = standings.matches
      .filter(
        (m) =>
          m.group === table.name && !m.decided && teams.includes(m.home) && teams.includes(m.away)
      )
      .sort(earlierFirst);

    const blank = teams.map((team) => ({
      team,
      clinched: false,
      eliminated: false,
      winClinches: false,
      lossEliminates: false,
    }));
    if (pending.length > MAX_PENDING) {
      result.set(table.name, blank);
      continue;
    }

    // 팀별 "다음 경기" = 남은 경기 중 가장 이른 것. pending이 이미 날짜순이라 처음 만나는 것이 그것이다
    const nextMatch = new Map<string, number>();
    pending.forEach((match, index) => {
      if (!nextMatch.has(match.home)) nextMatch.set(match.home, index);
      if (!nextMatch.has(match.away)) nextMatch.set(match.away, index);
    });

    const stat = new Map(
      teams.map((team) => [
        team,
        { allCertain: true, anyPossible: false, winAllCertain: true, lossAnyPossible: false },
      ])
    );

    const total = OUTCOMES ** pending.length;
    for (let combo = 0; combo < total; combo += 1) {
      const rows = table.rows.map((row) => ({ ...row }));
      const byTeam = new Map(rows.map((row) => [row.team, row]));
      const homeWon: boolean[] = [];

      let digit = 1;
      for (const match of pending) {
        const outcome = Math.floor(combo / digit) % OUTCOMES;
        digit *= OUTCOMES;
        const home = byTeam.get(match.home);
        const away = byTeam.get(match.away);
        if (!home || !away) continue; // 위에서 걸렀지만 타입상 방어
        // 앞 5가지는 홈 승, 뒤 5가지는 원정 승. 나머지 자리가 진 쪽 세트 수(0~4)
        const winnerIsHome = outcome < 5;
        const loserSets = outcome % 5;
        homeWon.push(winnerIsHome);
        applyResult(home, winnerIsHome ? 5 : loserSets, winnerIsHome ? loserSets : 5);
        applyResult(away, winnerIsHome ? loserSets : 5, winnerIsHome ? 5 : loserSets);
      }

      rows.sort(compareRows);

      // 진출선에 걸친 동률 무리를 찾는다. 그 무리는 전부 "가능"이되 누구도 "확정"이 아니다 —
      // 동전 던지기(팀명 순)를 확정이라고 말하면 안 된다
      const cut = Math.min(JUNGMAN_ADVANCING, rows.length);
      let lo = cut - 1;
      let hi = cut - 1;
      if (cut < rows.length) {
        while (lo > 0 && onlyNameApart(rows[lo - 1], rows[lo])) lo -= 1;
        while (hi + 1 < rows.length && onlyNameApart(rows[hi + 1], rows[hi])) hi += 1;
      }
      const certainEnd = hi >= cut ? lo : cut;
      const possibleEnd = Math.max(hi + 1, cut);

      rows.forEach((row, index) => {
        const s = stat.get(row.team);
        if (!s) return;
        const certain = index < certainEnd;
        const possible = index < possibleEnd;
        if (!certain) s.allCertain = false;
        if (possible) s.anyPossible = true;

        const next = nextMatch.get(row.team);
        if (next === undefined) return;
        const won = pending[next].home === row.team ? homeWon[next] : !homeWon[next];
        if (won) {
          if (!certain) s.winAllCertain = false;
        } else if (possible) {
          s.lossAnyPossible = true;
        }
      });
    }

    result.set(
      table.name,
      teams.map((team) => {
        const s = stat.get(team);
        const clinched = s ? s.allCertain : false;
        const eliminated = s ? !s.anyPossible : false;
        // 이미 끝난 얘기를 또 하지 않는다
        const open = Boolean(s) && !clinched && !eliminated && nextMatch.has(team);
        return {
          team,
          clinched,
          eliminated,
          winClinches: open && (s?.winAllCertain ?? false),
          lossEliminates: open && !(s?.lossAnyPossible ?? true),
        };
      })
    );
  }

  return result;
}
