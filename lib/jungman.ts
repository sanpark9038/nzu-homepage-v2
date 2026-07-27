import { getSetting } from "@/lib/site-settings";

export const JUNGMAN_CONFIG_KEY = "jungman_config";
export const JUNGMAN_SNAPSHOTS_KEY = "jungman_snapshots";
/** 마지막 수집 호출 흔적 — 크론·뷰어 폴링이 실제로 도는지 확인용 */
export const JUNGMAN_HEARTBEAT_KEY = "jungman_heartbeat";
/**
 * 최신 스냅샷 요약 {at, round}만 담는 가벼운 키(수백 바이트).
 * 쿨다운으로 스킵될 호출이 86KB짜리 스냅샷 배열을 통째로 읽지 않게 하려고 따로 둔다.
 */
export const JUNGMAN_LATEST_KEY = "jungman_latest";

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
/** 크론이 부르는 주기 — 화면 안내 문구의 근거이기도 하다 */
export const JUNGMAN_COLLECT_INTERVAL_MS = 3 * 60 * 1000;
/**
 * 기록 최소 간격. 크론 주기보다 짧아야 한다.
 * 스냅샷 시각은 수집이 끝난 뒤에 찍히므로 매 회차가 처리 시간만큼 뒤로 밀리는데,
 * 쿨다운이 크론 주기와 같으면 그 몇 초 때문에 한 번 걸러져 실제 간격이 3분/6분으로 널뛴다.
 */
export const JUNGMAN_COLLECT_COOLDOWN_MS = 150 * 1000;

/** "3분"·"1시간" — 수집 주기 안내 문구용. 상수가 바뀌면 화면 문구도 따라 바뀐다. */
export function jungmanIntervalLabel(ms: number = JUNGMAN_COLLECT_INTERVAL_MS): string {
  const minutes = Math.max(1, Math.round(ms / 60_000));
  return minutes >= 60 ? `${Math.round(minutes / 60)}시간` : `${minutes}분`;
}

export type JungmanTeam = {
  code: string;
  name: string;
  color: string;
  /** 그래프·득표 바처럼 다크 배경 위에 그릴 때 쓰는 색. 브랜드색이 어두우면 로고에서 뽑아 따로 준다 */
  accent?: string;
  /** 화면에 찍는 약칭. 코드는 DB 매핑 키라 못 바꾸므로 표기만 따로 둔다 */
  short?: string;
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
  { code: "DM", name: "DM", color: "#2f3f6e", accent: "#7c8fd6", dark: false, x: 301.3, y: 56.5, pinX: 301.3, pinY: 56.5, aliases: ["DM", "디엠"] },
  { code: "KMS", name: "캄몬스타즈", short: "CALM", color: "#2f6fd0", dark: false, x: 210.9, y: 238.1, pinX: 219.4, pinY: 226.1, aliases: ["캄몬스타즈", "캄몬", "츠캄몬스타즈", "츠캄", "CALM", "TSUCALM"] },
  { code: "C9", name: "씨나인", color: "#f4a9c4", dark: false, x: 278.9, y: 373, pinX: 278.9, pinY: 373, aliases: ["씨나인", "시나인", "C9"] },
  { code: "WFU", name: "와플대", color: "#ece0cc", dark: false, x: 305.1, y: 225.4, pinX: 316.1, pinY: 237.4, aliases: ["와플대", "와플", "WFU"] },
  { code: "JSA", name: "JSA", color: "#e8801a", dark: true, x: 399.3, y: 233.5, pinX: 427.7, pinY: 260, aliases: ["JSA", "제이에스에이"] },
  { code: "BGM", name: "BGM", color: "#f2a98f", dark: false, x: 493.3, y: 222.4, pinX: 464.9, pinY: 237.4, aliases: ["BGM", "비지엠"] },
  { code: "HKA", name: "흑카데미", short: "B.A", color: "#0f0f0f", accent: "#e2532b", dark: true, x: 416.3, y: 320.4, pinX: 446.3, pinY: 293.9, aliases: ["흑카데미", "블랙아카데미", "블아", "B.A", "BA", "BLACK"] },
  { code: "HM", name: "HM", color: "#f2f2f2", dark: false, x: 513.5, y: 350.4, pinX: 483.5, pinY: 350.4, aliases: ["HM", "에이치엠"] },
  { code: "SSG", name: "신세계", color: "#e0574a", dark: true, x: 427.7, y: 440.9, pinX: 427.7, pinY: 440.9, aliases: ["신세계", "SSG"] },
  { code: "NCS", name: "뉴캣슬", color: "#7b6fd0", dark: true, x: 725.3, y: 124.3, pinX: 725.3, pinY: 124.3, aliases: ["뉴캣슬", "뉴캐슬", "NCS", "N.C.S"] },
  { code: "MBU", name: "엠비대", color: "#8a8a8a", dark: true, x: 887.1, y: 167.3, pinX: 887.1, pinY: 167.3, aliases: ["엠비대", "MBU"] },
  { code: "SSU", name: "수술대", color: "#cfe3f5", dark: true, x: 860, y: 294.6, pinX: 874, pinY: 282.6, aliases: ["수술대", "SSU"] },
  { code: "KU", name: "케이대", color: "#2a2f3a", accent: "#b8c4d6", dark: false, x: 943.8, y: 282.6, pinX: 929.8, pinY: 282.6, aliases: ["케이대", "KU", "K.U"] },
];

/** 화면 표기용 약칭 — 없으면 코드를 그대로 쓴다 */
export function teamShort(team: JungmanTeam): string {
  return team.short || team.code;
}

/** 다크 배경 위에 그릴 색 — 브랜드색이 어두운 팀은 로고에서 뽑은 accent를 쓴다 */
export function teamAccent(team: JungmanTeam): string {
  return team.accent || team.color;
}

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
  accent: string;
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
  /** KV 읽기가 실패해 기본값으로 내려온 상태. "아직 개표 전"과 반드시 구분해야 한다. */
  degraded: boolean;
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

/**
 * 가벼운 최신 표식 파서. 깨졌거나 없으면 null — 호출자는 스냅샷 배열로 되돌아간다(하위호환).
 */
export function parseJungmanLatest(raw: string | null): { at: string; round: number } | null {
  if (!raw) return null;

  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return null;
  }
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return null;

  const record = parsed as Record<string, unknown>;
  const at = toIsoOrNull(record.at);
  const round = Math.floor(Number(record.round));
  if (!at || !Number.isFinite(round) || round <= 0) return null;

  return { at, round };
}

/** 한 시점의 순위표. 스냅샷이든 버킷 시리즈 한 점이든 votes만 있으면 된다. */
export function jungmanRankMap(snapshot: { votes: Record<string, number> }): Map<string, number> {
  const ordered = JUNGMAN_VOTING_TEAMS.slice().sort((a, b) => {
    const diff = (snapshot.votes[b.code] || 0) - (snapshot.votes[a.code] || 0);
    if (diff !== 0) return diff;
    // 동률은 선언 순서로 고정 — 새로고침마다 순위가 흔들리지 않게
    return (VOTING_ORDER.get(a.code) || 0) - (VOTING_ORDER.get(b.code) || 0);
  });
  return new Map(ordered.map((team, index) => [team.code, index + 1]));
}

/**
 * 차트·범례 강조 3단계. 의미 있는 자리는 컷라인이지 득표 상위가 아니다 —
 * 5~9위는 어느 쪽 경계도 다투지 않으므로 배경으로 뺀다.
 */
export type JungmanEmphasis = "lead" | "edge" | "back";

export function jungmanEmphasis(rank: number): JungmanEmphasis {
  // 시드권(1~3위)과 와일드카드권(11~12위)
  if (rank <= JUNGMAN_SEED_CUT || rank > JUNGMAN_WILDCARD_CUT) return "lead";
  // 컷라인 바로 안쪽에서 다투는 4위·10위
  if (rank === JUNGMAN_SEED_CUT + 1 || rank === JUNGMAN_WILDCARD_CUT) return "edge";
  return "back";
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
  const currentRanks = jungmanRankMap(latest);
  const previousRanks = previous ? jungmanRankMap(previous) : null;

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

// 조사 선택용 받침 판정. 영문·숫자는 한국어 읽기의 끝소리로 본다 (M=엠 받침O, A=에이 받침X).
const JONGSEONG_LATIN = new Set(["L", "M", "N", "R", "0", "1", "3", "6", "7", "8"]);

function hasJongseong(word: string): boolean {
  const char = word.trim().slice(-1).toUpperCase();
  const code = char.charCodeAt(0);
  if (code >= 0xac00 && code <= 0xd7a3) return (code - 0xac00) % 28 !== 0;
  return JONGSEONG_LATIN.has(char);
}

function withParticle(word: string, jong: string, plain: string): string {
  return `${word}${hasJongseong(word) ? jong : plain}`;
}

/**
 * 티커용 문장 묶음 — 중요도순 최대 5개.
 *
 * 비교 기준은 직전 스냅샷이 아니라 "1시간 전"(없으면 가장 오래된 것)이다.
 * 수집이 3분 간격이라 인접 두 기록 사이에는 사건이 거의 없어 티커가 한 문장으로 굳는다.
 * 사건(교체·컷라인)이 없어도 경합·격차·상승 같은 상시 소재로 채워 3문장 이상을 만든다.
 */
export function buildJungmanHeadlines(
  snapshots: JungmanSnapshot[],
  voteCloseAt: string | null = null,
  now = Date.now()
): string[] {
  const latest = snapshots.length ? snapshots[snapshots.length - 1] : null;
  if (!latest) return [];

  const ranks = jungmanRankMap(latest);
  const ordered = JUNGMAN_VOTING_TEAMS.slice().sort(
    (a, b) => (ranks.get(a.code) || 0) - (ranks.get(b.code) || 0)
  );
  const votesOf = (team: JungmanTeam) => latest.votes[team.code] || 0;
  const leaderVotes = votesOf(ordered[0]);

  // 마감 뒤에는 진행 중을 암시하는 문장이 한 줄도 나오면 안 된다 — 확정 결과 한 문장으로 고정한다.
  // 표수는 붙이지 않는다: 마감 순간 공지가 비공개로 바뀌면 마지막 몇 분의 추천이 집계에 안 잡혀
  // 우리 숫자가 확정치가 아니다. 순위만 말하고 수치는 공지에 맡긴다.
  if (voteCloseAt && isJungmanClosed(voteCloseAt, now)) {
    return [`최종 결과 — 1위 ${ordered[0].name}`];
  }

  const cutoff = Date.parse(latest.at) - HOUR_MS;
  const baseline = snapshots.filter((snapshot) => Date.parse(snapshot.at) <= cutoff).pop() ?? snapshots[0];
  const baselineRanks = baseline === latest ? null : jungmanRankMap(baseline);

  const lines: string[] = [];
  const push = (line: string | null) => {
    if (line && !lines.includes(line)) lines.push(line);
  };

  // 1) 순위 교체 — 타임라인의 최근 2건. 시각을 붙여 언제 일어난 일인지 남긴다.
  for (const event of buildJungmanRankEvents(snapshots, 2)) {
    push(`${jungmanSeoulTime(event.at)} ${withParticle(event.name, "이", "가")} ${event.rank}위로 올라섰습니다`);
  }

  // 2) 컷라인 통과 — 시드권·와일드카드권 경계를 넘나든 팀
  let crossings = 0;
  for (const team of ordered) {
    if (!baselineRanks || crossings >= 2) break;
    const rank = ranks.get(team.code) || 0;
    const before = baselineRanks.get(team.code) || 0;
    const line =
      before > JUNGMAN_SEED_CUT && rank <= JUNGMAN_SEED_CUT
        ? "시드권에 진입했습니다"
        : before <= JUNGMAN_SEED_CUT && rank > JUNGMAN_SEED_CUT
          ? "시드권에서 밀려났습니다"
          : before > JUNGMAN_WILDCARD_CUT && rank <= JUNGMAN_WILDCARD_CUT
            ? "와일드카드권에서 벗어났습니다"
            : before <= JUNGMAN_WILDCARD_CUT && rank > JUNGMAN_WILDCARD_CUT
              ? "와일드카드권으로 밀렸습니다"
              : null;
    if (!line) continue;

    crossings++;
    push(`${withParticle(team.name, "이", "가")} ${line}`);
  }

  // 3) 마감 임박 — 6시간 안쪽일 때만. 스스로 사라지는 소재라 상시 소재보다 앞에 둔다.
  const remaining = voteCloseAt ? Date.parse(voteCloseAt) - now : NaN;
  if (Number.isFinite(remaining) && remaining > 0 && remaining <= 6 * HOUR_MS) {
    const hours = Math.floor(remaining / HOUR_MS);
    const minutes = Math.max(1, Math.floor((remaining % HOUR_MS) / 60_000));
    push(`투표 마감까지 ${hours ? `${hours}시간 ` : ""}${minutes}분 남았습니다`);
  }

  /** i번째와 i+1번째 순위의 표차 한 줄 */
  const gapLine = (i: number): string | null => {
    if (leaderVotes <= 0 || i < 0 || i + 1 >= ordered.length) return null;
    const gap = votesOf(ordered[i]) - votesOf(ordered[i + 1]);
    const upper = withParticle(ordered[i].name, "과", "와");
    const lower = withParticle(ordered[i + 1].name, "이", "가");
    return gap === 0
      ? `${i + 1}위 ${upper} ${i + 2}위 ${lower} 동률입니다`
      : `${i + 1}위 ${upper} ${i + 2}위 ${lower} ${formatVotes(gap)}표 차입니다`;
  };

  // 4) 초박빙 — 인접 표차가 1위 표수의 3% 이내인 가장 높은 자리 한 건
  const threshold = leaderVotes * JUNGMAN_CONTEST_RATIO;
  let tight = -1;
  if (threshold > 0) {
    for (let i = 0; i < ordered.length - 1 && tight < 0; i++) {
      if (votesOf(ordered[i]) - votesOf(ordered[i + 1]) <= threshold) tight = i;
    }
    if (tight >= 0) push(gapLine(tight));
  }

  // 5~6) 컷라인 경합 — 3위/4위, 10위/11위. 사건이 없는 날의 주력 소재다.
  push(gapLine(JUNGMAN_SEED_CUT - 1));
  push(gapLine(JUNGMAN_WILDCARD_CUT - 1));

  // 7) 최다 상승 — 1시간 전 기록이 있으면 그 구간, 없으면 누적 전체
  const hourDeltas = buildJungmanHourDeltas(snapshots);
  const hourly = Object.keys(hourDeltas).length > 0;
  let riser: JungmanTeam | null = null;
  let bestGain = 0;
  for (const team of ordered) {
    const gain = hourly
      ? hourDeltas[team.code] || 0
      : votesOf(team) - (baseline.votes[team.code] || 0);
    if (gain > bestGain) {
      bestGain = gain;
      riser = team;
    }
  }
  if (riser) {
    push(
      `${hourly ? "최근 1시간" : "지금까지"} ${withParticle(riser.name, "이", "가")} +${formatVotes(bestGain)}표로 가장 많이 늘었습니다`
    );
  }

  // 8) 만 단위 이정표 — 기준 시점에는 못 미쳤고 지금 넘긴 경우만
  const sum = (votes: Record<string, number>) =>
    JUNGMAN_VOTING_TEAMS.reduce((total, team) => total + (votes[team.code] || 0), 0);
  const milestone = Math.floor(sum(latest.votes) / 10_000) * 10_000;
  if (milestone > 0 && sum(baseline.votes) < milestone) {
    push(`총 투표수 ${milestone / 10_000}만 표를 넘었습니다`);
  }

  // 9) 선두 격차 — 늘 참인 마지막 채움. 초박빙이 이미 1·2위를 다뤘으면 생략한다.
  if (tight !== 0 && ordered.length > 1) {
    const gap = leaderVotes - votesOf(ordered[1]);
    if (gap > 0) {
      push(`1위 ${withParticle(ordered[0].name, "이", "가")} 2위와 ${formatVotes(gap)}표 차로 앞서 있습니다`);
    }
  }

  if (!lines.length) {
    return [`1위 ${withParticle(ordered[0].name, "이", "가")} ${formatVotes(leaderVotes)}표로 선두를 지키고 있습니다`];
  }
  return lines.slice(0, 5);
}

// ── 추이 차트용 시리즈 ────────────────────────────────────────────────
// 득표는 누적값이다. 버킷 대표값으로 평균을 쓰면 없던 계단이 생긴다 — 마지막 값(종가)만 쓴다.

export type JungmanSeriesPoint = { at: string; votes: Record<string, number> };
export type JungmanRangeKey = "h1" | "h6" | "all";
export type JungmanSeries = {
  key: JungmanRangeKey;
  label: string;
  points: JungmanSeriesPoint[];
};

const HOUR_MS = 60 * 60 * 1000;

/** 구간별 창 크기와 버킷 크기. 1시간은 원본(3분) 그대로, 전체는 1시간 봉. */
const JUNGMAN_RANGES: { key: JungmanRangeKey; label: string; windowMs: number; bucketMs: number }[] = [
  { key: "h1", label: "1시간", windowMs: HOUR_MS, bucketMs: 0 },
  { key: "h6", label: "6시간", windowMs: 6 * HOUR_MS, bucketMs: 15 * 60 * 1000 },
  { key: "all", label: "전체", windowMs: Number.POSITIVE_INFINITY, bucketMs: HOUR_MS },
];

/** 구간을 버킷으로 묶어 각 버킷의 마지막(종가) 스냅샷만 남긴다. bucketMs<=0이면 원본 그대로. */
export function bucketJungmanSnapshots(snapshots: JungmanSnapshot[], bucketMs: number): JungmanSeriesPoint[] {
  const points = snapshots
    .map((snapshot) => ({ at: snapshot.at, votes: snapshot.votes, time: Date.parse(snapshot.at) }))
    .filter((point) => Number.isFinite(point.time))
    .sort((a, b) => a.time - b.time);

  if (bucketMs <= 0) return points.map(({ at, votes }) => ({ at, votes }));

  // 같은 버킷은 뒤에 오는 점이 덮어쓴다 → 남는 건 그 구간의 종가
  const byBucket = new Map<number, JungmanSeriesPoint>();
  for (const { at, votes, time } of points) byBucket.set(Math.floor(time / bucketMs), { at, votes });

  return [...byBucket.entries()].sort((a, b) => a[0] - b[0]).map(([, point]) => point);
}

/** 서버에서 3개 시리즈를 미리 만든다 — 클라이언트는 전환만 한다. */
export function buildJungmanSeries(snapshots: JungmanSnapshot[]): JungmanSeries[] {
  const end = snapshots.length ? Date.parse(snapshots[snapshots.length - 1].at) : 0;

  return JUNGMAN_RANGES.map(({ key, label, windowMs, bucketMs }) => {
    const window = Number.isFinite(windowMs)
      ? snapshots.filter((snapshot) => end - Date.parse(snapshot.at) <= windowMs)
      : snapshots;
    return { key, label, points: bucketJungmanSnapshots(window, bucketMs) };
  });
}

/**
 * 기본 구간 — 점이 2개 이상인 것 중 가장 넓은 쪽.
 * 투표 초반에는 1시간 봉이 한 점뿐이라 '전체'를 기본으로 두면 빈 차트가 보인다.
 */
export function defaultJungmanRange(series: JungmanSeries[]): JungmanRangeKey {
  for (let i = series.length - 1; i >= 0; i--) {
    if (series[i].points.length >= 2) return series[i].key;
  }
  return series[series.length - 1]?.key ?? "all";
}

// 한국시간 표기 — ko-KR + hour12:false는 자정을 24:00으로 뱉는 ICU가 있어 en-GB/h23을 쓴다
const SEOUL_TIME = new Intl.DateTimeFormat("en-GB", {
  timeZone: "Asia/Seoul",
  hourCycle: "h23",
  hour: "2-digit",
  minute: "2-digit",
});
const SEOUL_DATE = new Intl.DateTimeFormat("en-US", {
  timeZone: "Asia/Seoul",
  month: "numeric",
  day: "numeric",
});

/** 한국시간 HH:mm */
export function jungmanSeoulTime(at: string): string {
  return SEOUL_TIME.format(new Date(at));
}

/** 한국시간 M/D — 날짜 경계 판정 키로도 쓴다 */
export function jungmanSeoulDate(at: string): string {
  return SEOUL_DATE.format(new Date(at));
}

/** x축 라벨. 날짜가 바뀌는 지점(과 첫 점)에만 날짜를 붙인다. */
export function jungmanAxisLabel(at: string, previousAt: string | null = null): string {
  const time = jungmanSeoulTime(at);
  if (previousAt && jungmanSeoulDate(previousAt) === jungmanSeoulDate(at)) return time;
  return `${jungmanSeoulDate(at)} ${time}`;
}

/** 시리즈 안에서 한국시간 날짜가 바뀌는 지점 — 세로 경계선과 "n일차" 라벨용 */
export function jungmanDayBoundaries(points: JungmanSeriesPoint[]): { index: number; day: number }[] {
  const boundaries: { index: number; day: number }[] = [];
  for (let i = 1; i < points.length; i++) {
    if (jungmanSeoulDate(points[i - 1].at) === jungmanSeoulDate(points[i].at)) continue;
    boundaries.push({ index: i, day: boundaries.length + 2 });
  }
  return boundaries;
}

// ── 우측 레일용 집계 ──────────────────────────────────────────────────

/** 팀별 1시간 전 대비 증가분. 1시간 전 스냅샷이 없으면 빈 객체(= 화면엔 "—"). */
export function buildJungmanHourDeltas(snapshots: JungmanSnapshot[], windowMs = HOUR_MS): Record<string, number> {
  const latest = snapshots.length ? snapshots[snapshots.length - 1] : null;
  if (!latest) return {};

  const cutoff = Date.parse(latest.at) - windowMs;
  // 1시간 이전 중 가장 최근 스냅샷. 그만큼 오래된 기록이 없으면 비교하지 않는다.
  const baseline = snapshots.filter((snapshot) => Date.parse(snapshot.at) <= cutoff).pop();
  if (!baseline) return {};

  return Object.fromEntries(
    JUNGMAN_VOTING_TEAMS.map((team) => [
      team.code,
      (latest.votes[team.code] || 0) - (baseline.votes[team.code] || 0),
    ])
  );
}

/** 팀별 최고 순위(가장 작은 등수) */
export function buildJungmanBestRanks(snapshots: JungmanSnapshot[]): Record<string, number> {
  const best: Record<string, number> = {};
  for (const snapshot of snapshots) {
    for (const [code, rank] of jungmanRankMap(snapshot)) {
      if (best[code] === undefined || rank < best[code]) best[code] = rank;
    }
  }
  return best;
}

export type JungmanRankEvent = { at: string; code: string; name: string; rank: number };

/** 순위가 올라간 순간들 — 최신순 최대 limit개. */
export function buildJungmanRankEvents(snapshots: JungmanSnapshot[], limit = 6): JungmanRankEvent[] {
  const events: JungmanRankEvent[] = [];
  let previous = snapshots.length ? jungmanRankMap(snapshots[0]) : null;

  for (let i = 1; i < snapshots.length && previous; i++) {
    const current = jungmanRankMap(snapshots[i]);
    for (const team of JUNGMAN_VOTING_TEAMS) {
      const before = previous.get(team.code);
      const now = current.get(team.code);
      if (before === undefined || now === undefined || now >= before) continue;
      events.push({ at: snapshots[i].at, code: team.code, name: team.name, rank: now });
    }
    previous = current;
  }

  return events.slice(-limit).reverse();
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
      accent: teamAccent(team),
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

export function buildJungmanState(
  config: JungmanConfig,
  snapshots: JungmanSnapshot[],
  degraded = false
): JungmanState {
  const latest = snapshots.length ? snapshots[snapshots.length - 1] : null;

  return {
    config,
    snapshots,
    latest,
    standings: buildJungmanStandings(snapshots),
    isLive: isJungmanLive(latest),
    degraded,
  };
}

/** 투표 마감 여부. 서버에서 1회 판정한다 — 클라이언트 시계로 화면이 흔들리면 안 된다. */
export function isJungmanClosed(voteCloseAt: string, now = Date.now()): boolean {
  const at = Date.parse(voteCloseAt);
  return Number.isFinite(at) && now >= at;
}

export function isJungmanLive(latest: JungmanSnapshot | null, now = Date.now()): boolean {
  if (!latest) return false;
  const at = Date.parse(latest.at);
  return Number.isFinite(at) && now - at < JUNGMAN_LIVE_WINDOW_MS;
}

export async function getJungmanState(): Promise<JungmanState> {
  try {
    const [configRaw, snapshotsRaw] = await Promise.all([
      getSetting(JUNGMAN_CONFIG_KEY, null),
      getSetting(JUNGMAN_SNAPSHOTS_KEY, null),
    ]);

    return buildJungmanState(parseJungmanConfig(configRaw), parseJungmanSnapshots(snapshotsRaw));
  } catch (error) {
    // 읽기 한 번 실패로 "첫 개표 대기" 빈 화면을 60초 캐시하면 안 된다.
    // degraded를 실어 내려 화면이 안내를 띄우고 자동 갱신으로 스스로 회복하게 한다.
    console.error("failed to load jungman state", error);
    return buildJungmanState(JUNGMAN_DEFAULT_CONFIG, [], true);
  }
}

export function formatVotes(value: number): string {
  return value.toLocaleString("ko-KR");
}

/** 로고 파일명 규칙 — 팀 코드 소문자, 구두점 제거 (B.A → ba, N.C.S → ncs) */
export function jungmanLogoPath(code: string): string {
  return `/teams/${code.toLowerCase().replace(/[^a-z0-9]/g, "")}.png`;
}
