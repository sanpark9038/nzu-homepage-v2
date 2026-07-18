import { NextResponse } from "next/server";
import { cookies } from "next/headers";

import { ADMIN_SESSION_COOKIE, assertValidAdminSession } from "@/lib/admin-auth";
import { createSupabaseAdminClient } from "@/lib/supabase-admin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

async function requireAdmin() {
  const cookieStore = await cookies();
  assertValidAdminSession(cookieStore.get(ADMIN_SESSION_COOKIE)?.value);
}

// 오버레이 사용 신청 목록 (대기 먼저, 최신순)
export async function GET() {
  try {
    await requireAdmin();
  } catch {
    return NextResponse.json({ ok: false, message: "unauthorized" }, { status: 401 });
  }

  const db = createSupabaseAdminClient();
  const { data, error } = await db
    .from("overlay_access")
    .select("provider_user_id, display_name, role, target, status, created_at, approved_at")
    .order("status", { ascending: false }) // pending > approved (사전순 역순)
    .order("created_at", { ascending: false });

  if (error) {
    return NextResponse.json({ ok: false, message: error.message }, { status: 500 });
  }
  return NextResponse.json({ ok: true, entries: data ?? [] });
}

// 승인 / 삭제(거절·허용 회수 겸용)
export async function POST(req: Request) {
  try {
    await requireAdmin();
  } catch {
    return NextResponse.json({ ok: false, message: "unauthorized" }, { status: 401 });
  }

  const body = await req.json().catch(() => ({})) as { action?: string; providerUserId?: string };
  const providerUserId = String(body.providerUserId ?? "").trim();
  if (!providerUserId || (body.action !== "approve" && body.action !== "remove")) {
    return NextResponse.json({ ok: false, message: "action/providerUserId required" }, { status: 400 });
  }

  const db = createSupabaseAdminClient();
  const { error } = body.action === "approve"
    ? await db
        .from("overlay_access")
        .update({ status: "approved", approved_at: new Date().toISOString() })
        .eq("provider_user_id", providerUserId)
    : await db
        .from("overlay_access")
        .delete()
        .eq("provider_user_id", providerUserId);

  if (error) {
    return NextResponse.json({ ok: false, message: error.message }, { status: 500 });
  }
  return NextResponse.json({ ok: true });
}
