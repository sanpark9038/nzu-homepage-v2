import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { ADMIN_SESSION_COOKIE, assertValidAdminSession } from "@/lib/admin-auth";
import { updatePredictionMatches, readPredictionConfig } from "@/lib/tournament-prediction";

export const runtime = "nodejs";

export async function GET() {
  try {
    const cookieStore = await cookies();
    assertValidAdminSession(cookieStore.get(ADMIN_SESSION_COOKIE)?.value);
    const config = readPredictionConfig();
    return NextResponse.json({ ok: true, matches: config.matches || [] });
  } catch (error) {
    const status = error instanceof Error && error.message === "unauthorized" ? 401 : 500;
    return NextResponse.json({ ok: false, message: status === 401 ? "unauthorized" : "failed to load matches" }, { status });
  }
}

export async function POST(req: Request) {
  try {
    const cookieStore = await cookies();
    assertValidAdminSession(cookieStore.get(ADMIN_SESSION_COOKIE)?.value);
    const body = await req.json();
    const { matches } = body;

    if (!Array.isArray(matches)) {
      return NextResponse.json({ ok: false, message: "matches must be an array" }, { status: 400 });
    }

    updatePredictionMatches(matches);
    return NextResponse.json({ ok: true });
  } catch (error) {
    const status = error instanceof Error && error.message === "unauthorized" ? 401 : 500;
    return NextResponse.json({ ok: false, message: status === 401 ? "unauthorized" : "failed to update matches" }, { status });
  }
}
