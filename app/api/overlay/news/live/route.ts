import { NextResponse } from "next/server";

import { buildJungmanHourDeltas, getJungmanState } from "@/lib/jungman";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// 송출 티커 우측 존이 60초마다 읽는 공개 지표. 12팀 득표 합계와 1시간 증가 합계만 내려간다.
// (세션 없이 열려 있으므로 순위·팀별 수치는 일부러 내보내지 않는다.)
//
// force-dynamic + 메모리 캐시: getJungmanState는 fetch가 아니라 Supabase KV를 읽으므로
// Next의 fetch 캐시가 걸리지 않는다. 방송 중 여러 송출 화면이 붙어도 KV 읽기는 60초에 한 번.
const TTL_MS = 60_000;
let cache: { at: number; body: { totalVotes: number; hourDelta: number } | null } = { at: 0, body: null };

export async function GET() {
  if (cache.body && Date.now() - cache.at < TTL_MS) {
    return NextResponse.json(cache.body);
  }

  const state = await getJungmanState();
  const totalVotes = state.standings.reduce((sum, s) => sum + (s.votes ?? 0), 0);
  const hourDelta = Object.values(buildJungmanHourDeltas(state.snapshots)).reduce((sum, v) => sum + v, 0);

  // 개표 전(합계 0)이나 degraded는 캐시하지 않는다 — 티커가 항목을 숨긴 채 굳어버리면 안 된다.
  const body = { totalVotes, hourDelta };
  if (totalVotes > 0 && !state.degraded) cache = { at: Date.now(), body };

  return NextResponse.json(body);
}
