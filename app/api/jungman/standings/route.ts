import { NextResponse } from "next/server";

import {
  buildJungmanBestRanks,
  buildJungmanHeadlines,
  buildJungmanHourDeltas,
  buildJungmanMarkers,
  buildJungmanRankEvents,
  buildJungmanSeries,
  getJungmanState,
  isJungmanClosed,
  JUNGMAN_SEED_TEAM_CODE,
  JUNGMAN_TEAMS,
} from "@/lib/jungman";
import { jungmanLogoSrc } from "@/lib/jungman-logos";

/**
 * /jungman(서버 컴포넌트)이 보드에 넘기는 것과 같은 상태를 JSON으로 낸다 — 중립 도메인 미러용.
 * 공개 데이터라 인증은 없다. 원시 스냅샷 배열(수십 KB)과 config의 수집 설정(공지 번호·댓글 매핑)은
 * 화면이 쓰지 않으므로 빼고, 서버가 이미 계산해 둔 파생값만 담는다.
 */
export const dynamic = "force-dynamic";

export async function GET() {
  const { config, snapshots, latest, standings, isLive: inLiveWindow, degraded } = await getJungmanState();
  // 판정 규칙은 /jungman과 같아야 한다 — 두 화면이 같은 순간에 다른 상태를 말하면 안 된다
  const closed = isJungmanClosed(config.voteCloseAt);

  return NextResponse.json(
    {
      round: latest?.round ?? null,
      revealedAt: latest?.at ?? null,
      isLive: inLiveWindow && latest !== null && !closed,
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
    { headers: { "Cache-Control": "public, s-maxage=10, stale-while-revalidate=30" } }
  );
}
