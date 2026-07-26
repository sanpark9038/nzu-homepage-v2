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

/** 최신 스냅샷이 이 시간 이내면 실시간 집계(LIVE)로 본다 */
export const JUNGMAN_LIVE_WINDOW_MS = 10 * 60 * 1000;
/** 자동 수집 최소 간격 — 뷰어가 아무리 많아도 이보다 자주는 기록하지 않는다 */
export const JUNGMAN_COLLECT_INTERVAL_MS = 3 * 60 * 1000;

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
  /** 댓글에서 이 팀을 알아보기 위한 별칭. 영문 약칭은 단어 경계를 요구한다(HMM은 HM이 아니다). */
  aliases: string[];
};

// 좌표는 scratchpad/build-map.mjs 투영(1060x520, 인천~잠실 크롭) + 손 보정값 산출물.
export const JUNGMAN_TEAMS: JungmanTeam[] = [
  { code: "DM", name: "DM", color: "#3b4a8f", dark: false, x: 301.3, y: 56.5, pinX: 301.3, pinY: 56.5, aliases: ["DM", "디엠"] },
  { code: "KMS", name: "캄몬스타즈", color: "#2fb6c9", dark: false, x: 210.9, y: 238.1, pinX: 219.4, pinY: 226.1, aliases: ["캄몬스타즈", "캄몬", "츠캄몬스타즈", "츠캄", "CALM", "TSUCALM"] },
  { code: "C9", name: "씨나인", color: "#e88bb5", dark: false, x: 278.9, y: 373, pinX: 278.9, pinY: 373, aliases: ["씨나인", "시나인", "C9"] },
  { code: "WFU", name: "와플대", color: "#c9a24a", dark: false, x: 305.1, y: 225.4, pinX: 316.1, pinY: 237.4, aliases: ["와플대", "와플", "WFU"] },
  { code: "JSA", name: "JSA", color: "#c23b2e", dark: true, x: 399.3, y: 233.5, pinX: 427.7, pinY: 260, aliases: ["JSA", "제이에스에이"] },
  { code: "BGM", name: "BGM", color: "#d98936", dark: false, x: 493.3, y: 222.4, pinX: 464.9, pinY: 237.4, aliases: ["BGM", "비지엠"] },
  { code: "HKA", name: "흑카데미", color: "#d64545", dark: true, x: 416.3, y: 320.4, pinX: 446.3, pinY: 293.9, aliases: ["흑카데미", "블랙아카데미", "블아", "B.A", "BA", "BLACK"] },
  { code: "HM", name: "HM", color: "#9fb98a", dark: false, x: 513.5, y: 350.4, pinX: 483.5, pinY: 350.4, aliases: ["HM", "에이치엠"] },
  { code: "SSG", name: "신세계", color: "#8f2f2f", dark: true, x: 427.7, y: 440.9, pinX: 427.7, pinY: 440.9, aliases: ["신세계", "SSG"] },
  { code: "NCS", name: "뉴캣슬", color: "#7c5cff", dark: true, x: 725.3, y: 124.3, pinX: 725.3, pinY: 124.3, aliases: ["뉴캣슬", "뉴캐슬", "NCS", "N.C.S"] },
  { code: "MBU", name: "엠비대", color: "#556080", dark: true, x: 887.1, y: 167.3, pinX: 887.1, pinY: 167.3, aliases: ["엠비대", "MBU"] },
  { code: "SSU", name: "수술대", color: "#57a8e8", dark: true, x: 860, y: 294.6, pinX: 874, pinY: 282.6, aliases: ["수술대", "SSU"] },
  { code: "KU", name: "케이대", color: "#cdd3dd", dark: false, x: 943.8, y: 282.6, pinX: 929.8, pinY: 282.6, aliases: ["케이대", "KU", "K.U"] },
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
  /** 인기투표 공지글 주인 방송국 ID */
  soopId: string;
  /** 인기투표 공지글 번호. 없으면 자동 수집 불가 */
  titleNo: number | null;
  autoCollect: boolean;
  /** 댓글번호 → 팀코드 */
  mapping: Record<string, string>;
};

/** 숲 공지글 댓글 한 줄 — 추천수(likes)가 곧 그 팀의 득표 */
export type JungmanComment = {
  commentNo: number;
  userId: string;
  nick: string;
  text: string;
  likes: number;
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
  /** 최신 스냅샷이 LIVE 윈도 이내 — 서버에서 1회 계산한다 */
  isLive: boolean;
};

export const JUNGMAN_DEFAULT_CONFIG: JungmanConfig = {
  voteCloseAt: "2026-07-31T00:00:00+09:00",
  nextRevealAt: null,
  soopId: "ititit",
  titleNo: null,
  autoCollect: false,
  mapping: {},
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
  const titleNo = Math.floor(Number(record.titleNo));

  return {
    voteCloseAt: toIsoOrNull(record.voteCloseAt) || JUNGMAN_DEFAULT_CONFIG.voteCloseAt,
    nextRevealAt: toIsoOrNull(record.nextRevealAt),
    soopId: typeof record.soopId === "string" && record.soopId.trim() ? record.soopId.trim() : JUNGMAN_DEFAULT_CONFIG.soopId,
    titleNo: Number.isFinite(titleNo) && titleNo > 0 ? titleNo : null,
    autoCollect: record.autoCollect === true,
    mapping: parseJungmanMapping(record.mapping),
  };
}

/** 댓글번호(숫자 문자열) → 투표 대상 팀코드. 그 외는 전부 버린다. */
export function parseJungmanMapping(raw: unknown): Record<string, string> {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return {};

  const mapping: Record<string, string> = {};
  for (const [commentNo, code] of Object.entries(raw as Record<string, unknown>)) {
    if (!/^\d+$/.test(commentNo)) continue;
    if (typeof code !== "string" || !VOTING_CODES.has(code)) continue;
    mapping[commentNo] = code;
  }
  return mapping;
}

/** 매칭용 정규화 — 대문자 + 구두점 제거(B.A→BA, N.C.S→NCS), 공백은 한 칸으로 남긴다 */
function normalizeForMatch(raw: string): string {
  return raw
    .toUpperCase()
    .replace(/[^0-9A-Z가-힣ㄱ-ㅎㅏ-ㅣ\s]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

type AliasRule = { code: string; alias: string; latin: boolean };

// 긴 별칭 우선 — "츠캄몬스타즈"가 "츠캄"보다 먼저 잡혀야 via 표시가 정확하다.
const ALIAS_RULES: AliasRule[] = JUNGMAN_TEAMS.flatMap((team) =>
  team.aliases.map((alias) => {
    const normalized = normalizeForMatch(alias);
    return { code: team.code, alias: normalized, latin: /^[0-9A-Z]+$/.test(normalized) };
  })
)
  .filter(
    (rule, index, all) =>
      Boolean(rule.alias) && all.findIndex((other) => other.code === rule.code && other.alias === rule.alias) === index
  )
  .sort((a, b) => b.alias.length - a.alias.length);

/** 댓글 하나에서 잡힌 팀코드 → 걸린 별칭 */
function matchTeamAliases(spaced: string, compact: string): Map<string, string> {
  const hits = new Map<string, string>();
  for (const rule of ALIAS_RULES) {
    if (hits.has(rule.code)) continue;
    // 영문 약칭은 단어 경계 필수 — "HMM"이 HM으로, "OKU"가 KU로 잡히면 안 된다.
    const found = rule.latin
      ? new RegExp(`(^|[^0-9A-Z])${rule.alias}([^0-9A-Z]|$)`).test(spaced)
      : compact.includes(rule.alias);
    if (found) hits.set(rule.code, rule.alias);
  }
  return hits;
}

/** 총장·이사장 신청 댓글을 팬 잡담과 가르는 문구 */
const APPLY_PATTERN = /신청|참가|출전|등록|나갑니다|가겠습니다/;

/** ID 신호로 잡혔음을 관리자에게 알리는 via 접두사 */
export const JUNGMAN_ID_VIA = "숲ID 일치";

type Candidate = {
  comment: JungmanComment;
  via: string;
  /** 신청 문구가 있는 댓글 */
  applied: boolean;
  /** 텍스트·ID 두 신호가 일치 */
  agreed: boolean;
  /** ID 신호로도 잡힘 */
  byId: boolean;
};

/** 우선순위: 신청 문구 > 두 신호 일치 > ID 신호 > 먼저 쓴 댓글 */
function isBetterCandidate(next: Candidate, current: Candidate): boolean {
  for (const key of ["applied", "agreed", "byId"] as const) {
    if (next[key] !== current[key]) return next[key];
  }
  return next.comment.commentNo < current.comment.commentNo;
}

/**
 * 댓글 → 팀 자동 추정. 관리자가 손으로 고르는 수고를 덜기 위한 초안이고, 사람 확인이 최종이다.
 * 애매하면(팀 2개 이상, 후보 중복) 지정하지 않는다 — 틀린 추정보다 미지정이 낫다.
 *
 * identityByUserId: 숲ID(소문자) → 팀코드. 선수 명부에서 만들어 호출자가 넘긴다(이 파일은 DB를 모른다).
 * 팀명을 안 쓴 "신청합니다" 댓글을 잡는 게 이 신호의 이득이다.
 */
export function suggestJungmanMapping(
  comments: JungmanComment[],
  identityByUserId: Record<string, string> = {}
): {
  mapping: Record<string, string>;
  guesses: Record<string, { code: string; via: string }>;
} {
  const best = new Map<string, Candidate>();

  for (const comment of comments) {
    const spaced = normalizeForMatch(`${comment.text} ${comment.nick}`);
    const hits = matchTeamAliases(spaced, spaced.replace(/ /g, ""));
    // 팀이 2개 이상 잡힌 댓글은 신청 댓글인지 알 수 없다 — 텍스트 신호로 치지 않는다.
    const [textCode, textVia] = hits.size === 1 ? [...hits][0] : [null, null];
    // 여러 팀을 언급한 댓글은 소속으로도 귀속하지 않는다 — 선수가 쓴 잡담일 수 있다.
    const idCode = hits.size > 1 ? null : identityByUserId[comment.userId.trim().toLowerCase()] || null;

    // 소속과 다른 팀을 언급한 댓글은 팬 잡담이다 — 두 신호가 어긋나면 미지정.
    if (textCode && idCode && textCode !== idCode) continue;

    const code = textCode || idCode;
    if (!code || code === JUNGMAN_SEED_TEAM_CODE) continue;

    const via = textVia ? (idCode ? `${JUNGMAN_ID_VIA} · "${textVia}"` : textVia) : JUNGMAN_ID_VIA;

    // 추천수로만 고르면 팀명을 언급한 팬 댓글이 총장 신청 댓글을 이길 수 있다.
    const candidate: Candidate = {
      comment,
      via,
      applied: APPLY_PATTERN.test(comment.text),
      agreed: Boolean(textCode && idCode),
      byId: Boolean(idCode),
    };
    const current = best.get(code);
    if (!current || isBetterCandidate(candidate, current)) best.set(code, candidate);
  }

  const mapping: Record<string, string> = {};
  const guesses: Record<string, { code: string; via: string }> = {};
  for (const [code, { comment, via }] of best) {
    mapping[comment.commentNo] = code;
    guesses[comment.commentNo] = { code, via };
  }
  return { mapping, guesses };
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
  const latest = snapshots.length ? snapshots[snapshots.length - 1] : null;

  return {
    config,
    snapshots,
    latest,
    standings: buildJungmanStandings(snapshots),
    isLive: isJungmanLive(latest),
  };
}

export function isJungmanLive(latest: JungmanSnapshot | null, now = Date.now()): boolean {
  if (!latest) return false;
  const at = Date.parse(latest.at);
  return Number.isFinite(at) && now - at < JUNGMAN_LIVE_WINDOW_MS;
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
