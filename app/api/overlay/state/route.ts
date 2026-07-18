import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { randomUUID } from "node:crypto";

import { parsePublicAuthSessionCookieValue, PUBLIC_AUTH_SESSION_COOKIE } from "@/lib/public-auth";
import { createSupabaseAdminClient } from "@/lib/supabase-admin";
import { defaultOverlayState, type OverlayState } from "@/lib/overlay-types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// 공개 URL용 토큰 — 숲 ID는 추측이 쉬워 대진표(라인업)가 경기 전에 유출될 수 있음.
// 로그인(자기 데이터 연결)은 overlay_key(숲 ID) 그대로, 공개 조회만 이 토큰을 쓴다.
function generateViewToken() {
  return randomUUID().replace(/-/g, "");
}

async function getSession() {
  const cookieStore = await cookies();
  return parsePublicAuthSessionCookieValue(cookieStore.get(PUBLIC_AUTH_SESSION_COOKIE)?.value);
}

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const key = searchParams.get("key")?.trim();
  const db = createSupabaseAdminClient();

  // key 있음 = OBS 송출 페이지의 공개 조회 — view_token으로만 찾는다.
  // (overlay_key 즉 숲 ID로는 절대 조회 불가 — ID를 알아도 남의 대진표를 못 봄)
  if (key) {
    const { data } = await db
      .from("overlay_state")
      .select("data, updated_at")
      .eq("view_token", key)
      .maybeSingle();

    if (!data) {
      return NextResponse.json({ ok: false, message: "not found" }, { status: 404 });
    }
    return NextResponse.json({ ok: true, state: data.data as OverlayState, updatedAt: data.updated_at });
  }

  // key 없음 = 관리자 페이지의 자기 상태 로드 (숲 로그인 세션 필요)
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ ok: false, message: "unauthorized" }, { status: 401 });
  }

  const overlayKey = session.providerUserId;
  const { data, error } = await db
    .from("overlay_state")
    .select("data, updated_at, view_token")
    .eq("overlay_key", overlayKey)
    .maybeSingle();

  if (error) {
    return NextResponse.json({ ok: false, message: error.message }, { status: 500 });
  }

  // 첫 방문(행 없음) 또는 마이그레이션 전 저장분(토큰 없음) → 토큰 발급해 저장
  let viewToken = data?.view_token as string | null | undefined;
  if (!viewToken) {
    viewToken = generateViewToken();
    const { error: upsertError } = await db.from("overlay_state").upsert(
      {
        overlay_key: overlayKey,
        data: (data?.data as OverlayState) ?? defaultOverlayState(),
        view_token: viewToken,
        updated_at: new Date().toISOString(),
      },
      { onConflict: "overlay_key" }
    );
    if (upsertError) {
      return NextResponse.json({ ok: false, message: upsertError.message }, { status: 500 });
    }
  }

  return NextResponse.json({
    ok: true,
    state: (data?.data as OverlayState) ?? defaultOverlayState(),
    viewToken,
    updatedAt: data?.updated_at ?? null,
  });
}

export async function POST(req: Request) {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ ok: false, message: "unauthorized" }, { status: 401 });
  }

  const overlayKey = session.providerUserId;
  const body = await req.json().catch(() => ({})) as { state?: OverlayState };

  if (!body.state) {
    return NextResponse.json({ ok: false, message: "state required" }, { status: 400 });
  }

  const db = createSupabaseAdminClient();
  // view_token은 payload에 없으므로 upsert가 건드리지 않음 (기존 토큰 보존)
  const { error } = await db.from("overlay_state").upsert(
    { overlay_key: overlayKey, data: body.state, updated_at: new Date().toISOString() },
    { onConflict: "overlay_key" }
  );

  if (error) {
    return NextResponse.json({ ok: false, message: error.message }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}
