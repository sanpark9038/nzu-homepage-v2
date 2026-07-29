import { NextResponse } from "next/server";

import {
  buildJungmanBestRanks,
  buildJungmanHeadlines,
  buildJungmanHourDeltas,
  buildJungmanMarkers,
  buildJungmanRankEvents,
  buildJungmanSeries,
  buildJungmanStandings,
  getJungmanState,
  isJungmanClosed,
  JUNGMAN_SEED_TEAM_CODE,
  JUNGMAN_TEAMS,
  type JungmanSnapshot,
} from "@/lib/jungman";
import { buildVotesFromComments, fetchJungmanComments } from "@/lib/jungman-collector";
import { jungmanLogoSrc } from "@/lib/jungman-logos";

/**
 * /jungman(서버 컴포넌트)이 보드에 넘기는 것과 같은 상태를 JSON으로 낸다 — 중립 도메인 미러용.
 * 공개 데이터라 인증은 없다. 원시 스냅샷 배열(수십 KB)과 config의 수집 설정(공지 번호·댓글 매핑)은
 * 화면이 쓰지 않으므로 빼고, 서버가 이미 계산해 둔 파생값만 담는다.
 *
 * 미러 전용 라이브 라운드: 요청 시점에 숲에서 매핑된 댓글의 좋아요 수를 직접 읽어(수집기와 같은
 * fetch·집계 함수 재사용) 저장된 스냅샷 뒤에 메모리에서만 덧붙인다. KV에는 아무것도 쓰지 않으므로
 * 공식 3분 수집 파이프라인과 완전히 분리되며, 실패하면 조용히 스냅샷만으로 응답한다.
 * CDN 캐시(s-maxage=10)가 앞에 있어 숲 요청은 전 세계 시청자가 몇 명이든 10초에 최대 1번이다.
 */
export const dynamic = "force-dynamic";

const LIVE_FETCH_TIMEOUT_MS = 5000;

function sumVotes(votes: Record<string, number>) {
  return Object.values(votes).reduce((total, value) => total + value, 0);
}

/**
 * 라이브 라운드 시도 — 성공 시 스냅샷 배열에 덧붙일 스냅샷 하나를 돌려준다.
 * 실패·이상 징후(합계 감소)면 null: 호출부는 저장된 스냅샷만으로 응답한다.
 */
async function tryLiveRound(
  soopId: string,
  titleNo: number,
  mapping: Record<string, string>,
  lastSnapshot: JungmanSnapshot
): Promise<JungmanSnapshot | null> {
  try {
    const required = Object.keys(mapping).map(Number);
    const fetched = await Promise.race([
      fetchJungmanComments(soopId, titleNo, required),
      new Promise<never>((_, reject) =>
        setTimeout(() => reject(new Error("live_timeout")), LIVE_FETCH_TIMEOUT_MS)
      ),
    ]);
    if (!fetched.ok || !fetched.comments.length) return null;

    // 안 읽힌 팀 댓글은 직전 스냅샷 값 유지 (수집기의 carry-forward와 같은 규칙)
    const liveVotes = { ...lastSnapshot.votes, ...buildVotesFromComments(fetched.comments, mapping) };
    // 합계가 줄었으면 댓글 유실·파싱 이상 징후 — 수집기의 급락 가드와 같은 취지로 버린다
    if (sumVotes(liveVotes) < sumVotes(lastSnapshot.votes)) return null;

    return { round: lastSnapshot.round + 1, at: new Date().toISOString(), votes: liveVotes };
  } catch {
    return null;
  }
}

export async function GET() {
  const state = await getJungmanState();
  const { config, latest, isLive: inLiveWindow, degraded } = state;
  // 판정 규칙은 /jungman과 같아야 한다 — 두 화면이 같은 순간에 다른 상태를 말하면 안 된다
  const closed = isJungmanClosed(config.voteCloseAt);

  let snapshots = state.snapshots;
  let standings = state.standings;
  let revealedAt = latest?.at ?? null;
  let liveApplied = false;

  const lastSnapshot = snapshots[snapshots.length - 1];
  if (!closed && lastSnapshot && config.titleNo && Object.keys(config.mapping).length) {
    const liveSnapshot = await tryLiveRound(config.soopId, config.titleNo, config.mapping, lastSnapshot);
    if (liveSnapshot) {
      snapshots = [...snapshots, liveSnapshot];
      standings = buildJungmanStandings(snapshots);
      revealedAt = liveSnapshot.at;
      liveApplied = true;
    }
  }

  return NextResponse.json(
    {
      round: latest?.round ?? null,
      revealedAt,
      isLive: (inLiveWindow || liveApplied) && latest !== null && !closed,
      closed,
      autoCollect: config.autoCollect && !closed,
      degraded,
      voteCloseAt: config.voteCloseAt,
      nextRevealAt: config.nextRevealAt,
      seedTeamName: JUNGMAN_TEAMS.find((team) => team.code === JUNGMAN_SEED_TEAM_CODE)?.name ?? null,
      standings,
      markers: buildJungmanMarkers(standings),
      // 지도 마커는 12팀 — 투표 11팀만 담으면 수술대 로고가 빈다
      logos: Object.fromEntries(JUNGMAN_TEAMS.map((team) => [team.code, jungmanLogoSrc(team.code)])),
      headlines: buildJungmanHeadlines(snapshots, config.voteCloseAt),
      series: buildJungmanSeries(snapshots),
      hourDeltas: buildJungmanHourDeltas(snapshots),
      bestRanks: buildJungmanBestRanks(snapshots),
      rankEvents: buildJungmanRankEvents(snapshots),
    },
    // stale-while-revalidate를 두면 만료 후에도 최대 그 시간만큼 옛 응답이 나가 "N초 전"이 30초+로 밀린다.
    // 유예 없이 10초 만료 — 숲 요청은 여전히 10초당 최대 1회로 보호된다.
    { headers: { "Cache-Control": "public, s-maxage=10" } }
  );
}
