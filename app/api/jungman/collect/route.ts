import { revalidatePath } from "next/cache";
import { cookies } from "next/headers";
import { NextResponse } from "next/server";

import { ADMIN_SESSION_COOKIE, isValidAdminSession } from "@/lib/admin-auth";
import { collectJungmanSnapshot } from "@/lib/jungman-collector";

export const runtime = "nodejs";

/**
 * 뷰어 구동 수집 — 별도 cron 없이 /jungman을 보고 있는 사람이 수집을 돌린다.
 * 인증 없음(공개 데이터만 읽음). 쓰기는 collectJungmanSnapshot의 게이트가 막는다.
 * force(쿨다운 무시)는 관리자 쿠키가 있을 때만 통한다.
 */
export async function POST(req: Request) {
  try {
    const body = (await req.json().catch(() => ({}))) as { force?: boolean };

    let force = false;
    if (body.force === true) {
      const cookieStore = await cookies();
      force = isValidAdminSession(cookieStore.get(ADMIN_SESSION_COOKIE)?.value);
    }

    const result = await collectJungmanSnapshot(force);
    if (result.ok) revalidatePath("/jungman");

    return NextResponse.json(result);
  } catch (error) {
    return NextResponse.json(
      { ok: false, skipped: "error", reason: error instanceof Error ? error.message : "unknown" },
      { status: 500 }
    );
  }
}
