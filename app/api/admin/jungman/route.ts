import { revalidatePath } from "next/cache";
import { NextResponse } from "next/server";
import { cookies } from "next/headers";

import { ADMIN_SESSION_COOKIE, assertValidAdminSession } from "@/lib/admin-auth";
import {
  JUNGMAN_CONFIG_KEY,
  JUNGMAN_SNAPSHOTS_KEY,
  JUNGMAN_VOTING_TEAMS,
  parseJungmanConfig,
  parseJungmanSnapshots,
  type JungmanSnapshot,
} from "@/lib/jungman";
import { createSupabaseAdminClient } from "@/lib/supabase-admin";

export const runtime = "nodejs";

const MISSING_TABLE_MESSAGE =
  "site_settings 테이블이 없습니다. scripts/sql/create-site-settings.sql 을 Supabase에서 실행해주세요.";

async function requireAdmin() {
  const cookieStore = await cookies();
  assertValidAdminSession(cookieStore.get(ADMIN_SESSION_COOKIE)?.value);
}

async function readSetting(key: string) {
  const supabase = createSupabaseAdminClient();
  const { data, error } = await supabase.from("site_settings").select("value").eq("key", key).maybeSingle();

  if (error) {
    if (error.code === "PGRST205") throw new Error(MISSING_TABLE_MESSAGE);
    throw error;
  }
  return data?.value ?? null;
}

async function writeSetting(key: string, value: string) {
  const supabase = createSupabaseAdminClient();
  const { error } = await supabase
    .from("site_settings")
    .upsert({ key, value, updated_at: new Date().toISOString() }, { onConflict: "key" });

  if (error) {
    if (error.code === "PGRST205") throw new Error(MISSING_TABLE_MESSAGE);
    throw error;
  }
}

async function loadState() {
  const [configRaw, snapshotsRaw] = await Promise.all([
    readSetting(JUNGMAN_CONFIG_KEY),
    readSetting(JUNGMAN_SNAPSHOTS_KEY),
  ]);

  return {
    config: parseJungmanConfig(configRaw),
    snapshots: parseJungmanSnapshots(snapshotsRaw),
  };
}

function respondWith(state: { config: unknown; snapshots: unknown }, message: string) {
  revalidatePath("/jungman");
  revalidatePath("/admin/jungman");
  return NextResponse.json({ ok: true, message, ...state });
}

/** 12팀 표수 검증 — 음수·비정수·모르는 코드는 여기서 막는다(공개 파서에 기대지 않음). */
function normalizeVotes(raw: unknown) {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) {
    return { error: "표수 입력이 없습니다." as const };
  }

  const input = raw as Record<string, unknown>;
  const votes: Record<string, number> = {};

  for (const team of JUNGMAN_VOTING_TEAMS) {
    const value = input[team.code];
    const count = value === "" || value === null || value === undefined ? 0 : Number(value);
    if (!Number.isFinite(count) || count < 0 || !Number.isInteger(count)) {
      return { error: `${team.name} 표수가 올바르지 않습니다. 0 이상 정수만 입력해주세요.` as const };
    }
    votes[team.code] = count;
  }

  return { votes };
}

export async function GET() {
  try {
    await requireAdmin();
    const state = await loadState();
    return NextResponse.json({ ok: true, ...state });
  } catch (error) {
    return errorResponse(error, "중만컵 현황을 불러오지 못했습니다.");
  }
}

export async function POST(req: Request) {
  try {
    await requireAdmin();
    const body = (await req.json().catch(() => ({}))) as {
      action?: string;
      votes?: unknown;
      voteCloseAt?: string;
      nextRevealAt?: string | null;
    };
    const action = String(body.action || "").trim();

    if (action === "save-snapshot") {
      const normalized = normalizeVotes(body.votes);
      if ("error" in normalized) {
        return NextResponse.json({ ok: false, message: normalized.error }, { status: 400 });
      }

      const { config, snapshots } = await loadState();
      const nextRound = (snapshots[snapshots.length - 1]?.round || 0) + 1;
      const next: JungmanSnapshot[] = [
        ...snapshots,
        { round: nextRound, at: new Date().toISOString(), votes: normalized.votes },
      ];

      await writeSetting(JUNGMAN_SNAPSHOTS_KEY, JSON.stringify(next));
      return respondWith({ config, snapshots: next }, `${nextRound}차 개표를 저장했습니다.`);
    }

    if (action === "save-config") {
      const voteCloseAt = String(body.voteCloseAt || "").trim();
      if (!voteCloseAt || !Number.isFinite(Date.parse(voteCloseAt))) {
        return NextResponse.json({ ok: false, message: "투표 마감 시각이 올바르지 않습니다." }, { status: 400 });
      }

      const rawReveal = String(body.nextRevealAt || "").trim();
      if (rawReveal && !Number.isFinite(Date.parse(rawReveal))) {
        return NextResponse.json({ ok: false, message: "다음 개표 시각이 올바르지 않습니다." }, { status: 400 });
      }

      const config = {
        voteCloseAt: new Date(voteCloseAt).toISOString(),
        nextRevealAt: rawReveal ? new Date(rawReveal).toISOString() : null,
      };

      await writeSetting(JUNGMAN_CONFIG_KEY, JSON.stringify(config));
      const { snapshots } = await loadState();
      return respondWith({ config, snapshots }, "일정 설정을 저장했습니다.");
    }

    if (action === "delete-last-snapshot") {
      const { config, snapshots } = await loadState();
      if (!snapshots.length) {
        return NextResponse.json({ ok: false, message: "삭제할 개표 기록이 없습니다." }, { status: 400 });
      }

      const next = snapshots.slice(0, -1);
      await writeSetting(JUNGMAN_SNAPSHOTS_KEY, JSON.stringify(next));
      return respondWith({ config, snapshots: next }, `${snapshots[snapshots.length - 1].round}차 개표를 삭제했습니다.`);
    }

    return NextResponse.json({ ok: false, message: "알 수 없는 요청입니다." }, { status: 400 });
  } catch (error) {
    return errorResponse(error, "중만컵 현황 저장에 실패했습니다.");
  }
}

function errorResponse(error: unknown, fallback: string) {
  const message = error instanceof Error ? error.message : "";
  if (message === "unauthorized") {
    return NextResponse.json({ ok: false, message: "unauthorized" }, { status: 401 });
  }
  if (message === "missing_supabase_admin_env") {
    return NextResponse.json({ ok: false, message: "Supabase 관리자 환경변수가 없습니다." }, { status: 500 });
  }
  return NextResponse.json({ ok: false, message: message || fallback }, { status: 500 });
}
