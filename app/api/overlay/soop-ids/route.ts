import { NextResponse } from "next/server";

import { playerService } from "@/lib/player-service";

export const runtime = "nodejs";
export const revalidate = 300;

// 오버레이 관리자: 대진표 선수 옆 숲 방송 링크용. 공유되는 /api/players(매치업 페이지와 같이 쓰는
// 압축 포맷)를 건드리지 않으려고, soop_id 있는 선수만 담은 최소 응답을 따로 내려준다.
export async function GET() {
  const players = await playerService.getCachedPlayersList();
  const linkable = players
    .filter((p) => p.soop_id)
    .map((p) => ({ name: p.name, nickname: p.nickname ?? null, soopId: p.soop_id as string }));

  return NextResponse.json(
    { ok: true, players: linkable },
    { headers: { "Cache-Control": "s-maxage=300, stale-while-revalidate=31536000" } },
  );
}
