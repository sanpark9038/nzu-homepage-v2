import fs from "fs";
import path from "path";
import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { ADMIN_SESSION_COOKIE, assertValidAdminSession } from "@/lib/admin-auth";
import { saveRemoteRosterAdminCorrection } from "@/lib/roster-admin-store";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const ROOT = process.cwd();
const PROJECTS_DIR = path.join(ROOT, "data", "metadata", "projects");

type ProjectDoc = { team_code?: string; team_name?: string };

function loadTeamMap(): Map<string, { code: string; name: string }> {
  const map = new Map<string, { code: string; name: string }>();
  if (!fs.existsSync(PROJECTS_DIR)) return map;
  for (const entry of fs.readdirSync(PROJECTS_DIR, { withFileTypes: true })) {
    if (!entry.isDirectory()) continue;
    const code = entry.name;
    const filePath = path.join(PROJECTS_DIR, code, `players.${code}.v1.json`);
    if (!fs.existsSync(filePath)) continue;
    try {
      const raw = fs.readFileSync(filePath, "utf8").replace(/^﻿/, "");
      const doc = JSON.parse(raw) as ProjectDoc;
      const teamCode = (doc.team_code || code).toLowerCase();
      const teamName = doc.team_name || teamCode;
      map.set(teamCode, { code: teamCode, name: teamName });
      map.set(teamName.toLowerCase(), { code: teamCode, name: teamName });
    } catch {}
  }
  return map;
}

async function resolveTeam(rawTo: string): Promise<{ code: string; name: string } | null> {
  const lower = rawTo.trim().toLowerCase();
  const teamMap = loadTeamMap();
  if (teamMap.has(lower)) return teamMap.get(lower)!;

  const { createSupabaseAdminClient } = await import("@/lib/supabase-admin");
  const db = createSupabaseAdminClient();
  const { data } = await db
    .from("manual_teams")
    .select("code, name")
    .or(`code.eq.${lower},name.ilike.${lower}`)
    .neq("deleted", true)
    .maybeSingle();
  if (data) return { code: data.code, name: data.name };
  return null;
}

export async function POST(req: Request) {
  const cookieStore = await cookies();
  assertValidAdminSession(cookieStore.get(ADMIN_SESSION_COOKIE)?.value);

  const body = (await req.json().catch(() => ({}))) as {
    entity_id?: string;
    name?: string;
    review_kind?: string;
    observed_to?: string;
    soop_user_id?: string;
  };

  const entityId = String(body.entity_id || "").trim();
  const name = String(body.name || "").trim();
  const reviewKind = String(body.review_kind || "").trim();
  const observedTo = String(body.observed_to || "").trim();
  const soopUserId = String(body.soop_user_id || "").trim() || null;

  if (!entityId || !observedTo) {
    return NextResponse.json({ ok: false, message: "entity_id and observed_to are required" }, { status: 400 });
  }

  const updatedAt = new Date().toISOString();

  if (reviewKind === "affiliation_change" || reviewKind === "new_candidate") {
    const team = await resolveTeam(observedTo);
    if (!team) {
      return NextResponse.json({ ok: false, message: `팀을 찾을 수 없습니다: "${observedTo}"` }, { status: 404 });
    }
    await saveRemoteRosterAdminCorrection(entityId, {
      entity_id: entityId,
      name: name || null,
      team_code: team.code,
      team_name: team.name,
      manual_lock: true,
      manual_mode: "temporary",
      excluded: false,
      exclusion_reason: null,
      resume_requested_at: null,
      soop_user_id: soopUserId,
      updated_at: updatedAt,
    });
    return NextResponse.json({ ok: true, applied: { entity_id: entityId, team_code: team.code, team_name: team.name } });
  }

  if (reviewKind === "tier_change") {
    await saveRemoteRosterAdminCorrection(entityId, {
      entity_id: entityId,
      name: name || null,
      tier: observedTo,
      manual_lock: false,
      excluded: false,
      exclusion_reason: null,
      resume_requested_at: null,
      updated_at: updatedAt,
    });
    return NextResponse.json({ ok: true, applied: { entity_id: entityId, tier: observedTo } });
  }

  if (reviewKind === "race_change") {
    await saveRemoteRosterAdminCorrection(entityId, {
      entity_id: entityId,
      name: name || null,
      race: observedTo,
      manual_lock: false,
      excluded: false,
      exclusion_reason: null,
      resume_requested_at: null,
      updated_at: updatedAt,
    });
    return NextResponse.json({ ok: true, applied: { entity_id: entityId, race: observedTo } });
  }

  return NextResponse.json({ ok: false, message: `지원하지 않는 review_kind: ${reviewKind}` }, { status: 400 });
}
