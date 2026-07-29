import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { randomUUID } from "node:crypto";

import { parsePublicAuthSessionCookieValue, PUBLIC_AUTH_SESSION_COOKIE } from "@/lib/public-auth";
import { createSupabaseAdminClient } from "@/lib/supabase-admin";
import { defaultNewsState, type NewsState, type NewsRowState } from "@/components/starnews/news-types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// 뉴스 오버레이 상태 — overlay_state의 "별도 행"(overlay_key = "news:" + 숲ID)에 쓴다.
// 스코어보드 관리자가 자기 행 전체를 자동저장하므로 같은 행을 쓰면 경합으로 유실됨.
//
// 보안 계약: 이 라우트는 요청 파라미터를 일절 읽지 않는다 (공개 조회 경로 없음).
// 송출 페이지는 이 행의 view_token으로 기존 GET /api/overlay/state?key= 를 쓴다.

function generateViewToken() {
  return randomUUID().replace(/-/g, "");
}

async function getSession() {
  const cookieStore = await cookies();
  return parsePublicAuthSessionCookieValue(cookieStore.get(PUBLIC_AUTH_SESSION_COOKIE)?.value);
}

export async function GET() {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ ok: false, message: "unauthorized" }, { status: 401 });
  }

  const newsKey = `news:${session.providerUserId}`;
  const db = createSupabaseAdminClient();
  const { data, error } = await db
    .from("overlay_state")
    .select("data, updated_at, view_token")
    .eq("overlay_key", newsKey)
    .maybeSingle();

  if (error) {
    return NextResponse.json({ ok: false, message: error.message }, { status: 500 });
  }

  const row = (data?.data as Partial<NewsRowState> | null) ?? null;
  const state = row?.news ?? defaultNewsState();

  // 첫 방문(행 없음) 또는 토큰 없는 저장분 → 토큰 발급해 저장 (기존 data는 보존)
  let viewToken = data?.view_token as string | null | undefined;
  if (!viewToken) {
    viewToken = generateViewToken();
    const { error: upsertError } = await db.from("overlay_state").upsert(
      {
        overlay_key: newsKey,
        data: { ...(row ?? {}), news: state },
        view_token: viewToken,
        updated_at: new Date().toISOString(),
      },
      { onConflict: "overlay_key" }
    );
    if (upsertError) {
      return NextResponse.json({ ok: false, message: upsertError.message }, { status: 500 });
    }
  }

  return NextResponse.json({ ok: true, state, viewToken, updatedAt: data?.updated_at ?? null });
}

export async function POST(req: Request) {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ ok: false, message: "unauthorized" }, { status: 401 });
  }

  const newsKey = `news:${session.providerUserId}`;
  const body = (await req.json().catch(() => ({}))) as { news?: NewsState };

  if (!body.news) {
    return NextResponse.json({ ok: false, message: "news required" }, { status: 400 });
  }

  const db = createSupabaseAdminClient();
  // view_token은 payload에 없으므로 upsert가 건드리지 않음 (기존 토큰 보존)
  const { error } = await db.from("overlay_state").upsert(
    { overlay_key: newsKey, data: { news: body.news }, updated_at: new Date().toISOString() },
    { onConflict: "overlay_key" }
  );

  if (error) {
    return NextResponse.json({ ok: false, message: error.message }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}
