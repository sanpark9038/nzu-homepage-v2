import { cookies } from "next/headers";
import { parsePublicAuthSessionCookieValue, PUBLIC_AUTH_SESSION_COOKIE } from "@/lib/public-auth";
import OverlayAdminClient from "./OverlayAdminClient";

export default async function OverlayAdminPage() {
  const cookieStore = await cookies();
  const session = parsePublicAuthSessionCookieValue(
    cookieStore.get(PUBLIC_AUTH_SESSION_COOKIE)?.value
  );

  if (!session) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center gap-4 p-8">
        <p className="text-lg font-semibold">숲티비 로그인이 필요합니다.</p>
        <a
          href="/api/auth/soop/start?next=/overlay/admin"
          className="rounded-lg bg-nzu-green px-6 py-3 font-bold text-white hover:opacity-80"
        >
          숲티비로 로그인
        </a>
      </div>
    );
  }

  return (
    <OverlayAdminClient
      overlayKey={session.providerUserId}
      displayName={session.displayName}
    />
  );
}
