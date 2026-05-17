import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { ADMIN_SESSION_COOKIE, assertValidAdminSession } from "@/lib/admin-auth";
import { buildRosterOpsReview } from "@/lib/admin-roster-ops-review";

export const dynamic = "force-dynamic";

export async function GET() {
  const cookieStore = await cookies();
  assertValidAdminSession(cookieStore.get(ADMIN_SESSION_COOKIE)?.value);
  const review = await buildRosterOpsReview();
  return NextResponse.json({ ok: true, review });
}
