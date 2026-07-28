import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { parsePublicAuthSessionCookieValue, PUBLIC_AUTH_SESSION_COOKIE } from "@/lib/public-auth";
import { claimAttendance, getPointsVoterId } from "@/lib/points";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST() {
  const cookieStore = await cookies();
  const session = parsePublicAuthSessionCookieValue(cookieStore.get(PUBLIC_AUTH_SESSION_COOKIE)?.value);
  if (!session) {
    return NextResponse.json({ ok: false, message: "points_login_required" }, { status: 401 });
  }

  try {
    const result = await claimAttendance(getPointsVoterId(session), session.displayName);
    return NextResponse.json(result);
  } catch (error) {
    return NextResponse.json(
      { ok: false, message: error instanceof Error ? error.message : "attendance_failed" },
      { status: 400 }
    );
  }
}
