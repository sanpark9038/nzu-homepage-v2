import { NextResponse } from "next/server";
import { cookies } from "next/headers";

import { parsePublicAuthSessionCookieValue, PUBLIC_AUTH_SESSION_COOKIE } from "@/lib/public-auth";
import { createSupabaseAdminClient } from "@/lib/supabase-admin";
import { defaultOverlayState, type OverlayState } from "@/lib/overlay-types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const key = searchParams.get("key")?.trim();

  if (!key) {
    return NextResponse.json({ ok: false, message: "key required" }, { status: 400 });
  }

  const db = createSupabaseAdminClient();
  const { data } = await db
    .from("overlay_state")
    .select("data, updated_at")
    .eq("overlay_key", key)
    .maybeSingle();

  const state = (data?.data as OverlayState) ?? defaultOverlayState();
  return NextResponse.json({ ok: true, state, updatedAt: data?.updated_at ?? null });
}

export async function POST(req: Request) {
  const cookieStore = await cookies();
  const session = parsePublicAuthSessionCookieValue(
    cookieStore.get(PUBLIC_AUTH_SESSION_COOKIE)?.value
  );

  if (!session) {
    return NextResponse.json({ ok: false, message: "unauthorized" }, { status: 401 });
  }

  const overlayKey = session.providerUserId;
  const body = await req.json().catch(() => ({})) as { state?: OverlayState };

  if (!body.state) {
    return NextResponse.json({ ok: false, message: "state required" }, { status: 400 });
  }

  const db = createSupabaseAdminClient();
  const { error } = await db.from("overlay_state").upsert(
    { overlay_key: overlayKey, data: body.state, updated_at: new Date().toISOString() },
    { onConflict: "overlay_key" }
  );

  if (error) {
    return NextResponse.json({ ok: false, message: error.message }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}
