import { revalidatePath } from "next/cache";
import { cookies } from "next/headers";
import { after, NextResponse } from "next/server";

import { ADMIN_SESSION_COOKIE, isValidAdminSession } from "@/lib/admin-auth";
import { collectJungmanSnapshot } from "@/lib/jungman-collector";

export const runtime = "nodejs";

// ponytail: 인스턴스 메모리 스로틀 — 서버리스라 인스턴스마다 따로 논다.
// 완벽한 차단이 아니라 장난성 반복 호출이 DB까지 내려가는 걸 줄이는 게 목적이다.
// 인스턴스 간까지 막아야 하면 KV 락으로 올려라.
const THROTTLE_MS = 20_000;
let lastHandledAt = 0;

/**
 * 수집 진입점 — 서버 크론과 관리자 [지금 수집]이 쓴다.
 *
 * JUNGMAN_COLLECT_SECRET이 설정돼 있으면 x-jungman-secret 헤더가 일치해야 한다.
 * 설정 전에는 지금처럼 공개로 둔다 — 배포가 크론 헤더 설정보다 먼저 나가도 수집이 끊기면 안 된다.
 * force(쿨다운 무시)는 관리자 쿠키가 있을 때만 통한다.
 */
export async function POST(req: Request) {
  try {
    const body = (await req.json().catch(() => ({}))) as { force?: boolean };

    const cookieStore = await cookies();
    const admin = isValidAdminSession(cookieStore.get(ADMIN_SESSION_COOKIE)?.value);
    const force = body.force === true && admin;

    const secret = process.env.JUNGMAN_COLLECT_SECRET;
    if (secret && !admin && req.headers.get("x-jungman-secret") !== secret) {
      return NextResponse.json({ ok: false, skipped: "unauthorized" }, { status: 401 });
    }

    // 관리자 force는 예외 — [지금 수집]이 20초 벽에 막히면 손을 쓸 수단이 사라진다
    const now = Date.now();
    if (!force && now - lastHandledAt < THROTTLE_MS) {
      return NextResponse.json({ ok: false, skipped: "throttled" });
    }
    lastHandledAt = now;

    const result = await collectJungmanSnapshot(force);
    if (result.ok) {
      revalidatePath("/jungman");
      // 퍼지 뒤 첫 방문자는 재생성(콜드 스타트 ~2초)을 통째로 기다린다 — 응답을 보낸 뒤
      // 여기서 한 번 데워 그 비용을 크론이 대신 낸다. 실패해도 다음 방문자가 기다릴 뿐 수집과 무관.
      const origin = new URL(req.url).origin;
      after(async () => {
        try {
          // 무효화가 전 리전에 퍼지기 전에 데우면 옛 캐시를 맞고 헛돈다 — 전파(~300ms)를 기다린다
          await new Promise((resolve) => setTimeout(resolve, 1_000));
          await fetch(`${origin}/jungman`, { cache: "no-store", signal: AbortSignal.timeout(15_000) });
        } catch {
          // 워밍은 최선 노력 — 뷰어 90초 자동 갱신이 어차피 곧 다시 데운다
        }
      });
    }

    return NextResponse.json(result);
  } catch (error) {
    return NextResponse.json(
      { ok: false, skipped: "error", reason: error instanceof Error ? error.message : "unknown" },
      { status: 500 }
    );
  }
}
