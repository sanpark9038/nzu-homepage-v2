import { NextResponse } from "next/server";
import { buildRosterOpsReview } from "@/lib/admin-roster-ops-review";

export const dynamic = "force-dynamic";

export async function GET() {
  const review = await buildRosterOpsReview();
  return NextResponse.json({ ok: true, review });
}
