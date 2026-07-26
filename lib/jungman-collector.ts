/**
 * 숲(SOOP) 공지글 댓글 수집 — 중만컵 인기투표는 댓글 추천수(like_cnt)가 곧 득표다.
 * 게시글 본문은 열혈 전용이지만 댓글 API는 공개라 로그인 없이 읽힌다.
 */

import {
  JUNGMAN_COLLECT_INTERVAL_MS,
  JUNGMAN_CONFIG_KEY,
  JUNGMAN_SNAPSHOTS_KEY,
  parseJungmanConfig,
  parseJungmanSnapshots,
  type JungmanComment,
  type JungmanSnapshot,
} from "@/lib/jungman";
import { readSettingAdmin, writeSettingAdmin } from "@/lib/site-settings-admin";

const COMMENT_API = "https://chapi.sooplive.co.kr/api";

// UA가 없으면 404 HTML이 온다. 브라우저 문자열 필수.
const USER_AGENT =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36";

const FETCH_TIMEOUT_MS = 8000;
// per_page는 서버가 30으로 고정한다(요청값 무시) — 댓글 1200개까지가 상한.
const MAX_PAGES = 40;

// 타입 본체는 lib/jungman.ts에 둔다 — 관리자 클라이언트가 이 파일(service role)을 끌어오면 안 되므로.
export type { JungmanComment };

export type JungmanFetchResult =
  | { ok: true; comments: JungmanComment[] }
  | { ok: false; reason: string };

function toComment(entry: unknown): JungmanComment | null {
  if (!entry || typeof entry !== "object" || Array.isArray(entry)) return null;
  const row = entry as Record<string, unknown>;

  const commentNo = Math.floor(Number(row.p_comment_no));
  if (!Number.isFinite(commentNo) || commentNo <= 0) return null;

  // 대댓글은 원 댓글을 태그한다 — 추천수 주인이 아니라서 버린다.
  if (Number(row.tag_index ?? -1) >= 0) return null;

  const likes = Math.floor(Number(row.like_cnt));
  if (!Number.isFinite(likes) || likes < 0) return null;

  return {
    commentNo,
    userId: String(row.user_id || ""),
    nick: String(row.user_nick || ""),
    text: String(row.comment || ""),
    likes,
  };
}

async function fetchPage(soopId: string, titleNo: number, page: number) {
  const res = await fetch(`${COMMENT_API}/${encodeURIComponent(soopId)}/title/${titleNo}/comment?page=${page}`, {
    cache: "no-store",
    headers: { "User-Agent": USER_AGENT, Accept: "application/json" },
    signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
  });

  if (!res.ok) throw new Error(`댓글 API ${res.status}`);
  return (await res.json()) as Record<string, unknown>;
}

/**
 * 전 페이지 순회. 실패해도 예외를 던지지 않는다 — 수집 실패가 페이지를 깨뜨리면 안 된다.
 * requiredCommentNos를 주면 그 댓글을 다 찾는 즉시 멈춘다. 3분마다 도는 수집이
 * 팬 댓글 수백 개까지 끝까지 읽을 이유가 없다(관리자 매핑 화면은 안 넘겨서 전부 받는다).
 */
export async function fetchJungmanComments(
  soopId: string,
  titleNo: number,
  requiredCommentNos?: number[]
): Promise<JungmanFetchResult> {
  if (!soopId.trim() || !Number.isFinite(titleNo) || titleNo <= 0) {
    return { ok: false, reason: "invalid_target" };
  }

  const byNo = new Map<number, JungmanComment>();
  const pending = new Set(requiredCommentNos || []);

  try {
    let lastPage = 1;
    for (let page = 1; page <= Math.min(lastPage, MAX_PAGES); page++) {
      const json = await fetchPage(soopId, titleNo, page);

      const meta = (json.meta as Record<string, unknown> | undefined)?.meta as
        | Record<string, unknown>
        | undefined;
      const reported = Math.floor(Number(meta?.last_page));
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

  return { ok: true, comments: [...byNo.values()] };
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

/** KV 한 칸에 다 들어가므로 무한히 쌓을 수 없다. round 번호는 계속 증가하고 앞에서 잘라낸다. */
const MAX_SNAPSHOTS = 500;
/** 직전 합계 대비 이 비율 미만으로 급락하면 수집 사고로 보고 기록하지 않는다 */
const ANOMALY_FLOOR_RATIO = 0.7;

export type JungmanCollectResult =
  | { ok: true; round: number; votes: Record<string, number> }
  | { ok: false; skipped: string; reason?: string };

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
export async function collectJungmanSnapshot(force = false): Promise<JungmanCollectResult> {
  const config = parseJungmanConfig(await readSettingAdmin(JUNGMAN_CONFIG_KEY));
  if (!config.autoCollect || !config.titleNo || !Object.keys(config.mapping).length) {
    return { ok: false, skipped: "disabled" };
  }

  const snapshots = parseJungmanSnapshots(await readSettingAdmin(JUNGMAN_SNAPSHOTS_KEY));
  const latest = snapshots[snapshots.length - 1] || null;

  if (!force && latest && Date.now() - Date.parse(latest.at) < JUNGMAN_COLLECT_INTERVAL_MS) {
    return { ok: false, skipped: "cooldown" };
  }

  const fetched = await fetchJungmanComments(
    config.soopId,
    config.titleNo,
    Object.keys(config.mapping).map(Number)
  );
  if (!fetched.ok) return { ok: false, skipped: "fetch_failed", reason: fetched.reason };

  const votes = buildVotesFromComments(fetched.comments, config.mapping);
  // 매핑된 댓글이 하나도 안 잡혔다 = 글이 지워졌거나 매핑이 낡았다. 기존 기록을 덮지 않는다.
  if (!Object.keys(votes).length) return { ok: false, skipped: "no_match" };

  if (latest) {
    // 급락 가드는 관리자 force로 뚫는다 — 안 그러면 직전 수치가 한 번 부풀려진 순간
    // (수기 샘플 등) 자동 수집이 영원히 막히고 스스로 회복할 길이 없다.
    const previous = totalVotes(latest.votes);
    if (!force && previous > 0 && totalVotes(votes) < previous * ANOMALY_FLOOR_RATIO) {
      return { ok: false, skipped: "anomaly" };
    }
    if (sameVotes(latest.votes, votes)) return { ok: false, skipped: "unchanged" };
  }

  const round = (latest?.round || 0) + 1;
  const next: JungmanSnapshot[] = [...snapshots, { round, at: new Date().toISOString(), votes }].slice(
    -MAX_SNAPSHOTS
  );

  await writeSettingAdmin(JUNGMAN_SNAPSHOTS_KEY, JSON.stringify(next));
  return { ok: true, round, votes };
}
