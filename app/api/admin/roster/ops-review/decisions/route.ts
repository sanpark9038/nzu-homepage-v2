import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { ADMIN_SESSION_COOKIE, assertValidAdminSession } from "@/lib/admin-auth";
import { getAdminWriteDisabledMessage, isAdminWriteDisabled } from "@/lib/admin-runtime";
import { saveExcludedRosterReviewDecision } from "@/lib/roster-review-decisions";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  const cookieStore = await cookies();
  assertValidAdminSession(cookieStore.get(ADMIN_SESSION_COOKIE)?.value);

  if (isAdminWriteDisabled()) {
    return NextResponse.json(
      { ok: false, message: getAdminWriteDisabledMessage("로스터 검토 결정") },
      { status: 403 }
    );
  }

  const body = (await req.json().catch(() => ({}))) as {
    action?: string;
    entity_id?: string;
    name?: string;
    review_kind?: string;
    observed_from?: string;
    observed_to?: string;
  };

  if (body.action !== "exclude") {
    return NextResponse.json({ ok: false, message: "unsupported action" }, { status: 400 });
  }
  if (!body.entity_id || !body.review_kind) {
    return NextResponse.json({ ok: false, message: "entity_id and review_kind are required" }, { status: 400 });
  }

  const decision = saveExcludedRosterReviewDecision({
    entity_id: body.entity_id,
    name: body.name,
    review_kind: body.review_kind,
    observed_from: body.observed_from,
    observed_to: body.observed_to,
    source: "admin_ops_review",
    reason: "operator_excluded",
  });

  return NextResponse.json({ ok: true, decision });
}
