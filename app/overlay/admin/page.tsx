import { cookies } from "next/headers";
import { parsePublicAuthSessionCookieValue, PUBLIC_AUTH_SESSION_COOKIE } from "@/lib/public-auth";
import { getOverlayAccessStatus } from "@/lib/overlay-access";
import OverlayAdminClient from "./OverlayAdminClient";
import { AccessGate } from "./AccessGate";

export const dynamic = "force-dynamic";

export default async function OverlayAdminPage() {
  const cookieStore = await cookies();
  const session = parsePublicAuthSessionCookieValue(
    cookieStore.get(PUBLIC_AUTH_SESSION_COOKIE)?.value
  );

  if (!session) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center gap-4 p-8 text-center">
        <h1 className="text-lg font-black text-white/90">방송 스코어보드</h1>
        <p className="max-w-md text-sm leading-relaxed text-white/55">
          스트리머·실제 매니저분들을 위한 방송 오버레이 도구입니다.<br />
          현재 테스트 기간이라 일부 사용자에게만 열려 있어요. 숲티비로 로그인 후 신청할 수 있습니다.
        </p>
        <a
          href="/api/auth/soop/start?next=/overlay/admin"
          className="rounded-lg bg-nzu-green px-6 py-3 font-bold text-white hover:opacity-80"
        >
          숲티비로 로그인
        </a>
      </div>
    );
  }

  // 접근 판정 — 등록 선수·승인자만 도구 진입, 그 외엔 신청 게이트
  const access = await getOverlayAccessStatus(session.providerUserId);
  if (access === "none" || access === "pending") {
    return <AccessGate initialStatus={access} displayName={session.displayName} />;
  }

  return (
    <OverlayAdminClient
      overlayKey={session.providerUserId}
      displayName={session.displayName}
    />
  );
}
