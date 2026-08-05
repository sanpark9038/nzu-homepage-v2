import { revalidatePath } from "next/cache";
import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { ADMIN_SESSION_COOKIE, assertValidAdminSession } from "@/lib/admin-auth";
import { playerService } from "@/lib/player-service";
import { readSettingAdmin, writeSettingAdmin } from "@/lib/site-settings-admin";
import { buildTierFreezeValue, parseTierFreeze, TIER_FREEZE_KEY } from "@/lib/tier-freeze";

export const runtime = "nodejs";

async function requireAdmin() {
  const cookieStore = await cookies();
  assertValidAdminSession(cookieStore.get(ADMIN_SESSION_COOKIE)?.value);
}

// 스냅샷 전체는 응답에 넣지 않는다 — 수백 명이라 무겁다.
async function loadFreezeState() {
  const freeze = parseTierFreeze(await readSettingAdmin(TIER_FREEZE_KEY));
  if (!freeze) return null;
  return { active: true, frozenAt: freeze.frozenAt, playerCount: Object.keys(freeze.snapshot).length };
}

function errorResponse(error: unknown, fallbackMessage: string) {
  const status = error instanceof Error && error.message === "unauthorized" ? 401 : 500;
  return NextResponse.json(
    {
      ok: false,
      message:
        status === 401 ? "unauthorized" : error instanceof Error && error.message ? error.message : fallbackMessage,
    },
    { status }
  );
}

export async function GET() {
  try {
    await requireAdmin();
    return NextResponse.json({ ok: true, freeze: await loadFreezeState() });
  } catch (error) {
    return errorResponse(error, "티어 동결 상태를 불러오지 못했습니다.");
  }
}

export async function POST(req: Request) {
  try {
    await requireAdmin();
    const body = (await req.json().catch(() => ({}))) as { action?: string };
    const action = String(body.action || "").trim();

    if (action === "freeze") {
      const players = await playerService.getAllPlayers();
      await writeSettingAdmin(TIER_FREEZE_KEY, buildTierFreezeValue(players, new Date().toISOString()));
    } else if (action === "unfreeze") {
      await writeSettingAdmin(TIER_FREEZE_KEY, JSON.stringify({ active: false, frozenAt: "", snapshot: {} }));
    } else {
      return NextResponse.json({ ok: false, message: "알 수 없는 요청입니다." }, { status: 400 });
    }

    revalidatePath("/player");
    revalidatePath("/admin/tier-freeze");
    return NextResponse.json({ ok: true, freeze: await loadFreezeState() });
  } catch (error) {
    return errorResponse(error, "티어 동결 변경에 실패했습니다.");
  }
}
