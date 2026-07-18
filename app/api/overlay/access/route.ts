import { NextResponse } from "next/server";
import { cookies } from "next/headers";

import { parsePublicAuthSessionCookieValue, PUBLIC_AUTH_SESSION_COOKIE } from "@/lib/public-auth";
import { createSupabaseAdminClient } from "@/lib/supabase-admin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// 새 신청이 들어오면 디스코드로 즉시 알림 (기존 OPS 채널 재사용).
// 실패해도 신청 자체는 성공해야 하므로 절대 throw하지 않는다.
async function notifyDiscord(content: string) {
  const webhook = String(process.env.OPS_DISCORD_WEBHOOK_URL || "").trim();
  if (!webhook) return;
  try {
    await fetch(webhook, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ content }),
    });
  } catch {
    // 알림 실패는 무시 — 신청 처리에 영향 없음
  }
}

// 오버레이 사용 신청 — 숲 로그인 세션 기반이라 ID 위조 불가.
// 신청 레코드: { 숲ID, 표시이름, 역할(스트리머 본인|매니저), 대상(채널명|담당 스트리머) }
export async function POST(req: Request) {
  const cookieStore = await cookies();
  const session = parsePublicAuthSessionCookieValue(
    cookieStore.get(PUBLIC_AUTH_SESSION_COOKIE)?.value
  );
  if (!session) {
    return NextResponse.json({ ok: false, message: "unauthorized" }, { status: 401 });
  }

  const body = await req.json().catch(() => ({})) as { role?: string; target?: string };
  const role = body.role === "streamer" || body.role === "manager" ? body.role : null;
  // 매니저는 "담당 스트리머 (본인: 아이디)" 합성 문자열이라 여유 있게
  const target = String(body.target ?? "").trim().slice(0, 120);

  if (!role || !target) {
    return NextResponse.json({ ok: false, message: "role/target required" }, { status: 400 });
  }

  const db = createSupabaseAdminClient();

  // 이미 승인된 사람이 다시 신청해도 승인 상태를 깎아내리면 안 됨
  const { data: existing } = await db
    .from("overlay_access")
    .select("status")
    .eq("provider_user_id", session.providerUserId)
    .maybeSingle();
  if (existing?.status === "approved") {
    return NextResponse.json({ ok: true, status: "approved" });
  }

  const { error } = await db.from("overlay_access").upsert(
    {
      provider_user_id: session.providerUserId,
      display_name: session.displayName,
      role,
      target,
      status: "pending",
    },
    { onConflict: "provider_user_id" }
  );

  if (error) {
    return NextResponse.json({ ok: false, message: error.message }, { status: 500 });
  }

  // 새 신청일 때만 알림 — 같은 사람의 재신청(기존 행 갱신)은 생략해 사람당 알림 1번이 상한
  if (!existing) {
    const roleLabel = role === "streamer" ? "스트리머 본인" : "매니저";
    await notifyDiscord(
      [
        "📺 **오버레이 사용 신청**",
        `- 신청자: ${session.displayName} (숲 ID: ${session.providerUserId})`,
        `- 역할: ${roleLabel} · ${target}`,
        "- 승인: https://www.star-hosaga.com/admin/overlay-access",
      ].join("\n")
    );
  }

  return NextResponse.json({ ok: true, status: "pending" });
}
