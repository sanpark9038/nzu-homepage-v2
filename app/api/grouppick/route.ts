// 중만컵 조편성 예측 접수 — 공개 POST 전용. 조회 경로(GET)는 없다(집계는 주최자 페이지가 DB에서 직접 읽는다).
import { randomUUID } from "crypto";
import { NextResponse } from "next/server";
import { createSupabaseAdminClient } from "@/lib/supabase-admin";
import { GROUPS, SEEDS, isTeamCode, TEAMS } from "@/app/grouppick/teams";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const MAX_SUBMISSIONS = 3000;

function bad() {
  return NextResponse.json({ error: "invalid" }, { status: 400 });
}

export async function POST(request: Request) {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return bad();
  }
  const payload = body as { name?: unknown; groups?: unknown; hp?: unknown };

  // honeypot — 사람은 절대 채우지 않는 필드
  if (typeof payload.hp === "string" && payload.hp.trim()) return bad();

  const name = typeof payload.name === "string" ? payload.name.trim() : "";
  if (name.length < 1 || name.length > 12) return bad();

  const groups = payload.groups as Record<string, unknown> | null | undefined;
  if (!groups || typeof groups !== "object") return bad();

  const seen = new Set<string>();
  const clean: Record<string, string[]> = {};
  for (const group of GROUPS) {
    const picks = groups[group];
    if (!Array.isArray(picks) || picks.length !== 3) return bad();
    if (picks[0] !== SEEDS[group]) return bad();
    for (const code of picks) {
      if (typeof code !== "string" || !isTeamCode(code)) return bad();
      if (seen.has(code)) return bad();
      seen.add(code);
    }
    clean[group] = picks as string[];
  }
  // 12팀이 정확히 한 번씩
  if (seen.size !== TEAMS.length) return bad();

  const db = createSupabaseAdminClient();

  // 스팸 상한 — 1회성 방송 이벤트라 이 이상 쌓일 이유가 없다
  const { count } = await db
    .from("overlay_state")
    .select("overlay_key", { count: "exact", head: true })
    .like("overlay_key", "grouppick:%");
  if ((count ?? 0) >= MAX_SUBMISSIONS) {
    return NextResponse.json({ error: "closed" }, { status: 429 });
  }

  // updated_at은 결과 페이지의 "같은 닉네임 최신 제출 우선" 정렬 기준 — 컬럼 default에 기대지 않고 명시한다
  const { error } = await db.from("overlay_state").insert({
    overlay_key: `grouppick:${randomUUID()}`,
    data: { name, groups: clean, at: new Date().toISOString() },
    updated_at: new Date().toISOString(),
  });
  if (error) return NextResponse.json({ error: "save_failed" }, { status: 500 });

  return NextResponse.json({ ok: true });
}
