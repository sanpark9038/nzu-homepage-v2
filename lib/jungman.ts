import { getSetting } from "@/lib/site-settings";

export const JUNGMAN_CONFIG_KEY = "jungman_config";
export const JUNGMAN_SNAPSHOTS_KEY = "jungman_snapshots";

// 수술대는 투표 대상이 아니다 — 4시드 자동 확보. 득표 집계·순위·그래프에서 통째로 빠진다.
export const JUNGMAN_SEED_TEAM_CODE = "SSU";

export const JUNGMAN_VOTE_PERIOD_LABEL = "7월 27일 18:00 ~ 7월 30일 24:00";
export const JUNGMAN_VOTE_METHOD_LABEL = "숲(SOOP) 게시판 인기투표 댓글로 진행합니다.";

// 상·하위 컷라인. 12팀 중 1~3위 시드, 11~12위 와일드카드전.
export const JUNGMAN_SEED_CUT = 3;
export const JUNGMAN_WILDCARD_CUT = 10;
// 인접 순위와의 표차가 1위 표수의 이 비율 이내면 "경합"
export const JUNGMAN_CONTEST_RATIO = 0.03;

export type JungmanTeam = {
  code: string;
  name: string;
  color: string;
  /** 카드 배경이 어두워 약칭을 밝은색으로 써야 하는 팀 */
  dark: boolean;
  /** 지도 카드 좌표(배치 보정 반영) */
  x: number;
  y: number;
  /** 실제 연고지 투영 좌표 */
  pinX: number;
  pinY: number;
};

// 좌표는 scratchpad/build-map.mjs 투영(1060x520, 인천~잠실 크롭) + 손 보정값 산출물.
export const JUNGMAN_TEAMS: JungmanTeam[] = [
  { code: "DM", name: "DM", color: "#3b4a8f", dark: false, x: 301.3, y: 56.5, pinX: 301.3, pinY: 56.5 },
  { code: "KMS", name: "캄몬스타즈", color: "#2fb6c9", dark: false, x: 210.9, y: 238.1, pinX: 219.4, pinY: 226.1 },
  { code: "C9", name: "씨나인", color: "#e88bb5", dark: false, x: 278.9, y: 373, pinX: 278.9, pinY: 373 },
  { code: "WFU", name: "와플대", color: "#c9a24a", dark: false, x: 305.1, y: 225.4, pinX: 316.1, pinY: 237.4 },
  { code: "JSA", name: "JSA", color: "#c23b2e", dark: true, x: 399.3, y: 233.5, pinX: 427.7, pinY: 260 },
  { code: "BGM", name: "BGM", color: "#d98936", dark: false, x: 493.3, y: 222.4, pinX: 464.9, pinY: 237.4 },
  { code: "HKA", name: "흑카데미", color: "#d64545", dark: true, x: 416.3, y: 320.4, pinX: 446.3, pinY: 293.9 },
  { code: "HM", name: "HM", color: "#9fb98a", dark: false, x: 513.5, y: 350.4, pinX: 483.5, pinY: 350.4 },
  { code: "SSG", name: "신세계", color: "#8f2f2f", dark: true, x: 427.7, y: 440.9, pinX: 427.7, pinY: 440.9 },
  { code: "NCS", name: "뉴캣슬", color: "#7c5cff", dark: true, x: 725.3, y: 124.3, pinX: 725.3, pinY: 124.3 },
  { code: "MBU", name: "엠비대", color: "#556080", dark: true, x: 887.1, y: 167.3, pinX: 887.1, pinY: 167.3 },
  { code: "SSU", name: "수술대", color: "#57a8e8", dark: true, x: 860, y: 294.6, pinX: 874, pinY: 282.6 },
  { code: "KU", name: "케이대", color: "#cdd3dd", dark: false, x: 943.8, y: 282.6, pinX: 929.8, pinY: 282.6 },
];

/** 투표 대상 12팀 (수술대 제외) */
export const JUNGMAN_VOTING_TEAMS: JungmanTeam[] = JUNGMAN_TEAMS.filter(
  (team) => team.code !== JUNGMAN_SEED_TEAM_CODE
);

const VOTING_CODES = new Set(JUNGMAN_VOTING_TEAMS.map((team) => team.code));
const VOTING_ORDER = new Map(JUNGMAN_VOTING_TEAMS.map((team, index) => [team.code, index]));

export type JungmanConfig = {
  voteCloseAt: string;
  nextRevealAt: string | null;
};

export type JungmanSnapshot = {
  round: number;
  at: string;
  votes: Record<string, number>;
};

export type JungmanBadge = "seed" | "wildcard" | null;

export type JungmanStanding = {
  team: JungmanTeam;
  rank: number | null;
  votes: number | null;
  /** 직전 차수 대비 순위 변동 (양수 = 상승) */
  rankDelta: number | null;
  /** 직전 차수 대비 표 증가 */
  voteDelta: number | null;
  badge: JungmanBadge;
  contested: boolean;
};

export type JungmanMarker = {
  code: string;
  name: string;
  color: string;
  dark: boolean;
  x: number;
  y: number;
  pinX: number;
  pinY: number;
  rank: number | null;
  votes: number | null;
  /** 직전 차수 대비 순위 변동 (양수 = 상승) */
  rankDelta: number | null;
  /** 인접 순위와 표차가 근소 */
  contested: boolean;
  /** 1위 대비 득표 비율 0~1 — 지도 글로우 세기용. 개표 전 null */
  voteShare: number | null;
  badge: JungmanBadge;
  /** 수술대 전용 — 투표 없이 4시드 확보 */
  seed: boolean;
};

export type JungmanState = {
  config: JungmanConfig;
  snapshots: JungmanSnapshot[];
  latest: JungmanSnapshot | null;
  standings: JungmanStanding[];
};

export const JUNGMAN_DEFAULT_CONFIG: JungmanConfig = {
  voteCloseAt: "2026-07-31T00:00:00+09:00",
  nextRevealAt: null,
};

function toIsoOrNull(value: unknown): string | null {
  if (typeof value !== "string" || !value.trim()) return null;
  const time = Date.parse(value);
  return Number.isFinite(time) ? new Date(time).toISOString() : null;
}

export function parseJungmanConfig(raw: string | null): JungmanConfig {
  if (!raw) return JUNGMAN_DEFAULT_CONFIG;

  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return JUNGMAN_DEFAULT_CONFIG;
  }
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return JUNGMAN_DEFAULT_CONFIG;

  const record = parsed as Record<string, unknown>;
  return {
    voteCloseAt: toIsoOrNull(record.voteCloseAt) || JUNGMAN_DEFAULT_CONFIG.voteCloseAt,
    nextRevealAt: toIsoOrNull(record.nextRevealAt),
  };
}

/**
 * 방어적 파서 — 관리자 손입력과 수기 편집이 소스라서 깨진 JSON·음수·모르는 팀코드가 들어올 수 있다.
 * 수술대(SSU)를 포함해 투표 대상이 아닌 코드는 여기서 전부 버린다.
 */
export function parseJungmanSnapshots(raw: string | null): JungmanSnapshot[] {
  if (!raw) return [];

  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return [];
  }
  if (!Array.isArray(parsed)) return [];

  const snapshots: JungmanSnapshot[] = [];
  const seenRounds = new Set<number>();

  for (const entry of parsed) {
    if (!entry || typeof entry !== "object" || Array.isArray(entry)) continue;
    const record = entry as Record<string, unknown>;

    const round = Math.floor(Number(record.round));
    if (!Number.isFinite(round) || round <= 0 || seenRounds.has(round)) continue;

    const at = toIsoOrNull(record.at);
    if (!at) continue;

    const votes: Record<string, number> = {};
    const rawVotes = record.votes;
    if (rawVotes && typeof rawVotes === "object" && !Array.isArray(rawVotes)) {
      for (const [code, value] of Object.entries(rawVotes as Record<string, unknown>)) {
        if (!VOTING_CODES.has(code)) continue;
        const count = Math.floor(Number(value));
        if (!Number.isFinite(count) || count < 0) continue;
        votes[code] = count;
      }
    }

    seenRounds.add(round);
    snapshots.push({ round, at, votes });
  }

  snapshots.sort((a, b) => a.round - b.round);
  return snapshots;
}

function rankMap(snapshot: JungmanSnapshot): Map<string, number> {
  const ordered = JUNGMAN_VOTING_TEAMS.slice().sort((a, b) => {
    const diff = (snapshot.votes[b.code] || 0) - (snapshot.votes[a.code] || 0);
    if (diff !== 0) return diff;
    // 동률은 선언 순서로 고정 — 새로고침마다 순위가 흔들리지 않게
    return (VOTING_ORDER.get(a.code) || 0) - (VOTING_ORDER.get(b.code) || 0);
  });
  return new Map(ordered.map((team, index) => [team.code, index + 1]));
}

export function buildJungmanStandings(snapshots: JungmanSnapshot[]): JungmanStanding[] {
  const latest = snapshots.length ? snapshots[snapshots.length - 1] : null;

  if (!latest) {
    return JUNGMAN_VOTING_TEAMS.map((team) => ({
      team,
      rank: null,
      votes: null,
      rankDelta: null,
      voteDelta: null,
      badge: null,
      contested: false,
    }));
  }

  const previous = snapshots.length > 1 ? snapshots[snapshots.length - 2] : null;
  const currentRanks = rankMap(latest);
  const previousRanks = previous ? rankMap(previous) : null;

  const standings: JungmanStanding[] = JUNGMAN_VOTING_TEAMS.map((team): JungmanStanding => {
    const votes = latest.votes[team.code] || 0;
    const rank = currentRanks.get(team.code) || JUNGMAN_VOTING_TEAMS.length;
    const previousRank = previousRanks?.get(team.code) ?? null;

    return {
      team,
      rank,
      votes,
      rankDelta: previousRank === null ? null : previousRank - rank,
      voteDelta: previous ? votes - (previous.votes[team.code] || 0) : null,
      badge: rank <= JUNGMAN_SEED_CUT ? "seed" : rank > JUNGMAN_WILDCARD_CUT ? "wildcard" : null,
      contested: false,
    };
  }).sort((a, b) => (a.rank || 0) - (b.rank || 0));

  // 경합: 바로 위/아래와의 표차가 1위 표수의 3% 이내
  const leaderVotes = standings[0]?.votes || 0;
  const threshold = leaderVotes * JUNGMAN_CONTEST_RATIO;
  if (threshold > 0) {
    for (let i = 0; i < standings.length; i++) {
      const votes = standings[i].votes || 0;
      const above = i > 0 ? (standings[i - 1].votes || 0) - votes : Infinity;
      const below = i < standings.length - 1 ? votes - (standings[i + 1].votes || 0) : Infinity;
      standings[i].contested = Math.min(above, below) <= threshold;
    }
  }

  return standings;
}

/** 지도 마커 13개 — 투표 12팀 + 수술대(4시드 고정) */
export function buildJungmanMarkers(standings: JungmanStanding[]): JungmanMarker[] {
  const byCode = new Map(standings.map((standing) => [standing.team.code, standing]));
  const leaderVotes = Math.max(0, ...standings.map((standing) => standing.votes ?? 0));

  return JUNGMAN_TEAMS.map((team) => {
    const standing = byCode.get(team.code);
    return {
      code: team.code,
      name: team.name,
      color: team.color,
      dark: team.dark,
      x: team.x,
      y: team.y,
      pinX: team.pinX,
      pinY: team.pinY,
      rank: standing?.rank ?? null,
      votes: standing?.votes ?? null,
      rankDelta: standing?.rankDelta ?? null,
      contested: standing?.contested ?? false,
      voteShare: leaderVotes > 0 && standing?.votes != null ? standing.votes / leaderVotes : null,
      badge: standing?.badge ?? null,
      seed: team.code === JUNGMAN_SEED_TEAM_CODE,
    };
  });
}

export function buildJungmanState(config: JungmanConfig, snapshots: JungmanSnapshot[]): JungmanState {
  return {
    config,
    snapshots,
    latest: snapshots.length ? snapshots[snapshots.length - 1] : null,
    standings: buildJungmanStandings(snapshots),
  };
}

export async function getJungmanState(): Promise<JungmanState> {
  const [configRaw, snapshotsRaw] = await Promise.all([
    getSetting(JUNGMAN_CONFIG_KEY, null),
    getSetting(JUNGMAN_SNAPSHOTS_KEY, null),
  ]);

  return buildJungmanState(parseJungmanConfig(configRaw), parseJungmanSnapshots(snapshotsRaw));
}

export function formatVotes(value: number): string {
  return value.toLocaleString("ko-KR");
}

/** 로고 파일명 규칙 — 팀 코드 소문자, 구두점 제거 (B.A → ba, N.C.S → ncs) */
export function jungmanLogoPath(code: string): string {
  return `/teams/${code.toLowerCase().replace(/[^a-z0-9]/g, "")}.png`;
}
