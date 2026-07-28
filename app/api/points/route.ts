import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { parsePublicAuthSessionCookieValue, PUBLIC_AUTH_SESSION_COOKIE } from "@/lib/public-auth";
import { ATTENDANCE_REWARD, getLeaderboard, getMyPoints, getPointsVoterId } from "@/lib/points";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  const cookieStore = await cookies();
  const session = parsePublicAuthSessionCookieValue(cookieStore.get(PUBLIC_AUTH_SESSION_COOKIE)?.value);

  const [me, leaderboard] = await Promise.all([
    session ? getMyPoints(getPointsVoterId(session)) : null,
    getLeaderboard(),
  ]);

  return NextResponse.json({ ok: true, me, leaderboard, attendanceReward: ATTENDANCE_REWARD });
}
