import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { randomUUID } from "node:crypto";

import { parsePublicAuthSessionCookieValue, PUBLIC_AUTH_SESSION_COOKIE } from "@/lib/public-auth";
import { createSupabaseAdminClient } from "@/lib/supabase-admin";
import { defaultOverlayState } from "@/lib/overlay-types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// 공개 URL 토큰 재발급 — 토큰이 유출됐을 때(라인업 훔쳐보기 등) 기존 URL을 즉시 무효화.
// 재발급하면 이전 토큰이 든 OBS URL은 404가 되므로 OBS 소스 URL을 새로 복사해 넣어야 함.
export async function POST() {
  const cookieStore = await cookies();
  const session = parsePublicAuthSessionCookieValue(
    cookieStore.get(PUBLIC_AUTH_SESSION_COOKIE)?.value
  );
  if (!session) {
    return NextResponse.json({ ok: false, message: "unauthorized" }, { status: 401 });
  }

  const overlayKey = session.providerUserId;
  const viewToken = randomUUID().replace(/-/g, "");
  const db = createSupabaseAdminClient();

  // 행이 없으면(첫 사용) 기본 상태와 함께 생성 — data는 기존 값 보존을 위해 update 우선
  const { data: existing } = await db
    .from("overlay_state")
    .select("overlay_key")
    .eq("overlay_key", overlayKey)
    .maybeSingle();

  const { error } = existing
    ? await db.from("overlay_state").update({ view_token: viewToken }).eq("overlay_key", overlayKey)
    : await db.from("overlay_state").insert({
        overlay_key: overlayKey,
        data: defaultOverlayState(),
        view_token: viewToken,
        updated_at: new Date().toISOString(),
      });

  if (error) {
    return NextResponse.json({ ok: false, message: error.message }, { status: 500 });
  }

  return NextResponse.json({ ok: true, viewToken });
}
