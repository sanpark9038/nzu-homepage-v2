/**
 * 숲(SOOP) 공지글 댓글 수집 — 중만컵 인기투표는 댓글 추천수(like_cnt)가 곧 득표다.
 * 게시글 본문은 열혈 전용이지만 댓글 API는 공개라 로그인 없이 읽힌다.
 */

import {
  JUNGMAN_COLLECT_COOLDOWN_MS,
  JUNGMAN_CONFIG_KEY,
  JUNGMAN_HEARTBEAT_KEY,
  JUNGMAN_LATEST_KEY,
  JUNGMAN_SNAPSHOTS_KEY,
  parseJungmanConfig,
  parseJungmanLatest,
  parseJungmanSnapshots,
  type JungmanComment,
  type JungmanSnapshot,
} from "@/lib/jungman";
import { readSettingAdmin, writeSettingAdmin } from "@/lib/site-settings-admin";

/** 신형(기본) — 인증 없이 열린다. meta는 평평하고 필드는 camelCase다. */
const COMMENT_API = "https://api-channel.sooplive.com/v1.1/channel";
/** 구형(폴백) — 신형이 죽거나 빈손일 때만 부른다. meta가 한 겹 더 감싸여 있고 필드는 snake_case다. */
const LEGACY_COMMENT_API = "https://chapi.sooplive.co.kr/api";

type CommentSource = "modern" | "legacy";

const pageUrl = (source: CommentSource, soopId: string, titleNo: number, page: number) =>
  source === "modern"
    ? `${COMMENT_API}/${encodeURIComponent(soopId)}/post/${titleNo}/comment?page=${page}`
    : `${LEGACY_COMMENT_API}/${encodeURIComponent(soopId)}/title/${titleNo}/comment?page=${page}`;

// UA가 없으면 404 HTML이 온다. 브라우저 문자열 필수.
const USER_AGENT =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36";

const FETCH_TIMEOUT_MS = 8000;
// 페이지당 30개는 양쪽 API 모두 서버 고정이다 — 신형에 perPage=100을 줘도 meta.perPage는 30으로 답한다.
// 순회는 이미 API가 알려준 마지막 페이지에서 멈추므로 이 값은 폭주 방지용 천장일 뿐이다.
// 낮추면 글이 이 페이지 수를 넘겼을 때 뒷쪽 신청 댓글을 영영 못 찾는다 — 줄이지 말 것.
const MAX_PAGES = 40;

// 타입 본체는 lib/jungman.ts에 둔다 — 관리자 클라이언트가 이 파일(service role)을 끌어오면 안 되므로.
export type { JungmanComment };

export type JungmanFetchResult =
  | { ok: true; comments: JungmanComment[]; source: CommentSource }
  | { ok: false; reason: string };

/**
 * 신형·구형 한 줄을 같은 JungmanComment로 정규화한다.
 * 같은 글에서 두 API의 댓글번호·아이디·추천수·태그가 전부 일치하는 걸 확인했다 —
 * 이름만 camelCase/snake_case로 다르므로 키 두 쌍을 같이 읽는다.
 */
function toComment(entry: unknown): JungmanComment | null {
  if (!entry || typeof entry !== "object" || Array.isArray(entry)) return null;
  const row = entry as Record<string, unknown>;

  const commentNo = Math.floor(Number(row.pCommentNo ?? row.p_comment_no));
  if (!Number.isFinite(commentNo) || commentNo <= 0) return null;

  // 대댓글은 원 댓글을 태그한다 — 추천수 주인이 아니라서 버린다.
  // (신형의 cCommentCnt는 "달린 대댓글 수"라 판별에 쓸 수 없다. 판별은 양쪽 다 tagIndex다.)
  if (Number(row.tagIndex ?? row.tag_index ?? -1) >= 0) return null;

  const likes = Math.floor(Number(row.likeCnt ?? row.like_cnt));
  if (!Number.isFinite(likes) || likes < 0) return null;

  return {
    commentNo,
    userId: String(row.userId ?? row.user_id ?? ""),
    nick: String(row.userNick ?? row.user_nick ?? ""),
    text: String(row.comment || ""),
    likes,
  };
}

/** 신형은 meta.lastPage, 구형은 meta.meta.last_page — 둘 다 본다. */
function lastPageOf(json: Record<string, unknown>): number {
  const meta = json.meta as Record<string, unknown> | undefined;
  const nested = meta?.meta as Record<string, unknown> | undefined;
  return Math.floor(Number(meta?.lastPage ?? nested?.last_page));
}

async function fetchPage(source: CommentSource, soopId: string, titleNo: number, page: number) {
  const res = await fetch(pageUrl(source, soopId, titleNo, page), {
    cache: "no-store",
    headers: { "User-Agent": USER_AGENT, Accept: "application/json" },
    signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
  });

  if (!res.ok) throw new Error(`댓글 API ${res.status}`);
  return (await res.json()) as Record<string, unknown>;
}

/**
 * 한 소스의 전 페이지 순회. 실패해도 예외를 던지지 않는다 — 수집 실패가 페이지를 깨뜨리면 안 된다.
 * requiredCommentNos를 주면 그 댓글을 다 찾는 즉시 멈춘다. 3분마다 도는 수집이
 * 팬 댓글 수백 개까지 끝까지 읽을 이유가 없다(관리자 매핑 화면은 안 넘겨서 전부 받는다).
 */
async function fetchFrom(
  source: CommentSource,
  soopId: string,
  titleNo: number,
  requiredCommentNos?: number[]
): Promise<JungmanFetchResult> {
  const byNo = new Map<number, JungmanComment>();
  const pending = new Set(requiredCommentNos || []);

  try {
    let lastPage = 1;
    for (let page = 1; page <= Math.min(lastPage, MAX_PAGES); page++) {
      const json = await fetchPage(source, soopId, titleNo, page);

      const reported = lastPageOf(json);
      if (Number.isFinite(reported) && reported > lastPage) lastPage = reported;

      const rows = Array.isArray(json.data) ? json.data : [];
      if (!rows.length) break;
      for (const row of rows) {
        const comment = toComment(row);
        if (!comment) continue;
        byNo.set(comment.commentNo, comment);
        pending.delete(comment.commentNo);
      }

      if (requiredCommentNos?.length && !pending.size) break;
    }
  } catch (error) {
    return { ok: false, reason: error instanceof Error ? error.message : "fetch_failed" };
  }

  return { ok: true, comments: [...byNo.values()], source };
}

/**
 * 신형이 기본, 실패(오류·파싱 실패·0건)하면 구형으로 자동 폴백한다.
 * 정상 운영에서는 폴백이 안 돌아 요청 수가 그대로다 — 신형이 빈손일 때만 한 번 더 나간다.
 */
export async function fetchJungmanComments(
  soopId: string,
  titleNo: number,
  requiredCommentNos?: number[]
): Promise<JungmanFetchResult> {
  if (!soopId.trim() || !Number.isFinite(titleNo) || titleNo <= 0) {
    return { ok: false, reason: "invalid_target" };
  }

  const modern = await fetchFrom("modern", soopId, titleNo, requiredCommentNos);
  if (modern.ok && modern.comments.length) return modern;

  const legacy = await fetchFrom("legacy", soopId, titleNo, requiredCommentNos);
  if (legacy.ok && legacy.comments.length) return legacy;

  // 둘 다 빈손이면 신형 결과를 그대로 돌려준다(0건은 상위에서 no_match로 걸린다).
  return modern.ok ? modern : legacy;
}

/** mapping: 댓글번호 → 팀코드. 매핑에 없는 댓글은 무시한다. */
export function buildVotesFromComments(
  comments: JungmanComment[],
  mapping: Record<string, string>
): Record<string, number> {
  const votes: Record<string, number> = {};
  for (const comment of comments) {
    const code = mapping[String(comment.commentNo)];
    if (code) votes[code] = comment.likes;
  }
  return votes;
}

/**
 * KV 한 칸에 다 들어가므로 무한히 쌓을 수 없다. round 번호는 계속 증가하고 앞에서 잘라낸다.
 *
 * 투표 기간 78시간(7/27 18:00 ~ 7/30 24:00) × 3분 간격 = 시간당 20회 × 78 = 1560회.
 * 여유를 더해 1700. 대회 전체가 한 배열에 남아야 "최고 순위"와 전체 추이 그래프가 거짓말을 안 한다.
 * (500이면 25시간 만에 상한에 걸려 1일차가 조용히 잘려나간다.)
 * 스냅샷 1개 ≈ 170바이트 → 1700개 ≈ 280KB. 단일 text 값으로 충분하다.
 */
const MAX_SNAPSHOTS = 1700;
/** 마감 직후 늦게 반영되는 추천을 놓치지 않도록 이만큼만 더 수집한다 */
const COLLECT_GRACE_MS = 10 * 60 * 1000;
/** 직전 합계 대비 이 비율 미만으로 급락하면 수집 사고로 보고 기록하지 않는다 */
const ANOMALY_FLOOR_RATIO = 0.7;

export type JungmanCollectResult =
  // source는 구형 폴백이 돌았을 때만 붙는다 — 붙어 있으면 신형이 죽었다는 신호다.
  | { ok: true; round: number; votes: Record<string, number>; carried: string[]; source?: "legacy" }
  | { ok: false; skipped: string; reason?: string };

/**
 * 스냅샷 배열을 쓰는 유일한 통로. 요약 키를 같이 갱신해야 쿨다운 판정이 배열과 어긋나지 않는다 —
 * 관리자 수동 저장·삭제도 반드시 여기를 지나야 한다.
 */
export async function writeJungmanSnapshots(snapshots: JungmanSnapshot[]): Promise<void> {
  const latest = snapshots[snapshots.length - 1] || null;

  await writeSettingAdmin(JUNGMAN_SNAPSHOTS_KEY, JSON.stringify(snapshots));
  await writeSettingAdmin(
    JUNGMAN_LATEST_KEY,
    latest ? JSON.stringify({ at: latest.at, round: latest.round }) : ""
  );
}

function onCooldown(mark: { at: string } | null) {
  return mark !== null && Date.now() - Date.parse(mark.at) < JUNGMAN_COLLECT_COOLDOWN_MS;
}

function totalVotes(votes: Record<string, number>) {
  return Object.values(votes).reduce((sum, value) => sum + value, 0);
}

function sameVotes(a: Record<string, number>, b: Record<string, number>) {
  for (const code of new Set([...Object.keys(a), ...Object.keys(b)])) {
    if ((a[code] || 0) !== (b[code] || 0)) return false;
  }
  return true;
}

/**
 * 수집 1회. 공개 엔드포인트와 관리자 [지금 수집]이 공유한다.
 * 인증이 없는 대신 config 게이트 + 쿨다운 + 이상치 가드로 쓰기를 묶는다.
 */
/** 심박에 남길 최근 호출 수 — 회차가 건너뛰었을 때 원인을 되짚을 유일한 단서다 */
const HEARTBEAT_HISTORY = 20;

type HeartbeatEntry = { at: string; result: string; carried?: string[]; source?: "legacy" };

function nextHeartbeat(previous: string | null, result: JungmanCollectResult) {
  const entry: HeartbeatEntry = {
    at: new Date().toISOString(),
    result: result.ok ? `round ${result.round}` : result.skipped,
    // 직전 값을 이어받은 팀이 있으면 남긴다 — 관리자가 "왜 이 팀만 안 움직이나"를 알 수 있어야 한다
    ...(result.ok && result.carried.length ? { carried: result.carried } : {}),
    // 구형 폴백이 돌았으면 남긴다 — 신형이 언제부터 죽었는지 되짚을 유일한 흔적이다
    ...(result.ok && result.source ? { source: result.source } : {}),
  };

  let history: HeartbeatEntry[] = [];
  try {
    const parsed = previous ? JSON.parse(previous) : null;
    if (parsed && Array.isArray(parsed.history)) history = parsed.history.slice(-HEARTBEAT_HISTORY + 1);
    // 이력이 없던 옛 형식({at,result})도 첫 항목으로 살린다
    else if (parsed?.at) history = [{ at: parsed.at, result: String(parsed.result || "") }];
  } catch {
    // 깨진 심박은 버린다 — 진단용이라 유실돼도 수집에 영향이 없다
  }

  return { ...entry, history: [...history, entry] };
}

export async function collectJungmanSnapshot(force = false): Promise<JungmanCollectResult> {
  const previousHeartbeat = await readSettingAdmin(JUNGMAN_HEARTBEAT_KEY).catch(() => null);
  const result = await runCollect(force);
  // 심박 — 수집이 실제로 불렸는지 남긴다. 크론이 도는지 확인할 유일한 흔적이라
  // 기록에 실패해도 수집 결과를 뒤엎지 않는다.
  try {
    await writeSettingAdmin(
      JUNGMAN_HEARTBEAT_KEY,
      JSON.stringify(nextHeartbeat(previousHeartbeat, result))
    );
  } catch {
    // 무시
  }
  return result;
}

async function runCollect(force: boolean): Promise<JungmanCollectResult> {
  const config = parseJungmanConfig(await readSettingAdmin(JUNGMAN_CONFIG_KEY));
  if (!config.autoCollect || !config.titleNo || !Object.keys(config.mapping).length) {
    return { ok: false, skipped: "disabled" };
  }

  // 마감이 지나면 스스로 멈춘다. 크론을 해제하는 걸 잊어도 요금이 새지 않게 하는 최후 방어선 —
  // 이 게이트가 없으면 대회가 끝난 뒤에도 3분마다 숲 API와 DB를 영원히 두드린다.
  if (Date.now() > Date.parse(config.voteCloseAt) + COLLECT_GRACE_MS) {
    return { ok: false, skipped: "vote_closed" };
  }

  // 쿨다운은 가벼운 키로 먼저 본다 — 스킵될 호출이 86KB 스냅샷 배열을 읽으면 전송량만 태운다.
  // 이 값은 이력 소실 가드와 경합 가드의 기준으로도 쓰인다(읽기는 한 번뿐).
  const summary = parseJungmanLatest(await readSettingAdmin(JUNGMAN_LATEST_KEY));
  if (!force && onCooldown(summary)) return { ok: false, skipped: "cooldown" };

  const snapshots = parseJungmanSnapshots(await readSettingAdmin(JUNGMAN_SNAPSHOTS_KEY));
  const latest = snapshots[snapshots.length - 1] || null;

  // 요약 키에 기록이 남아 있는데 배열이 비었다 = 스냅샷 JSON이 깨졌거나 지워졌다.
  // 여기서 그냥 쓰면 round 1짜리 새 배열이 이력 전체를 덮는다. force로도 못 뚫는다 —
  // 수집 한 회차를 거르는 것보다 며칠치 이력을 날리는 쪽이 훨씬 위험하다.
  if (summary && !snapshots.length) return { ok: false, skipped: "history_lost" };

  // 가벼운 키가 없거나 깨졌을 때의 폴백 — 판정 기준은 스냅샷 배열이 원본이다.
  if (!force && onCooldown(latest)) return { ok: false, skipped: "cooldown" };

  const fetched = await fetchJungmanComments(
    config.soopId,
    config.titleNo,
    Object.keys(config.mapping).map(Number)
  );
  if (!fetched.ok) return { ok: false, skipped: "fetch_failed", reason: fetched.reason };

  const votes = buildVotesFromComments(fetched.comments, config.mapping);
  // 매핑된 댓글이 하나도 안 잡혔다 = 글이 지워졌거나 매핑이 낡았다. 기존 기록을 덮지 않는다.
  if (!Object.keys(votes).length) return { ok: false, skipped: "no_match" };

  // 매핑된 댓글 일부만 못 찾은 경우(댓글 삭제·숨김) 그 팀만 직전 값을 이어받는다.
  // 안 그러면 그 팀은 0표로 추락하고, 비중이 큰 팀이면 합계가 급락해 이상치 가드가
  // 매 회차 걸린다 — 비교 기준이 갱신되지 않으니 수집이 영구 정지한다.
  const carried: string[] = [];
  if (latest) {
    for (const code of new Set(Object.values(config.mapping))) {
      if (votes[code] !== undefined || latest.votes[code] === undefined) continue;
      votes[code] = latest.votes[code];
      carried.push(code);
    }
  }

  if (latest) {
    // 급락 가드는 관리자 force로 뚫는다 — 안 그러면 직전 수치가 한 번 부풀려진 순간
    // (수기 샘플 등) 자동 수집이 영원히 막히고 스스로 회복할 길이 없다.
    const previous = totalVotes(latest.votes);
    if (!force && previous > 0 && totalVotes(votes) < previous * ANOMALY_FLOOR_RATIO) {
      return { ok: false, skipped: "anomaly" };
    }
    if (sameVotes(latest.votes, votes)) return { ok: false, skipped: "unchanged" };
  }

  // 읽기~쓰기 사이에 잠금이 없다 — 크론과 관리자 [지금 수집]이 겹치면 한쪽 회차가 통째로 사라진다.
  // 쓰기 직전에 요약 키를 다시 읽어 그사이 누가 기록했으면 물러난다. 다음 회차가 3분 뒤에 온다.
  // 낙관적 확인이라 확인~쓰기 사이의 아주 좁은 창은 남는다 — 완전한 잠금이 필요해지면 DB 조건부 갱신으로.
  const recheck = parseJungmanLatest(await readSettingAdmin(JUNGMAN_LATEST_KEY));
  if ((recheck?.round ?? null) !== (summary?.round ?? null)) return { ok: false, skipped: "raced" };

  const round = (latest?.round || 0) + 1;
  const at = new Date().toISOString();
  const next: JungmanSnapshot[] = [...snapshots, { round, at, votes }].slice(-MAX_SNAPSHOTS);

  await writeJungmanSnapshots(next);
  return { ok: true, round, votes, carried, ...(fetched.source === "legacy" ? { source: "legacy" as const } : {}) };
}
