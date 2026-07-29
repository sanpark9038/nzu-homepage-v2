import { cookies } from "next/headers";
import { parsePublicAuthSessionCookieValue, PUBLIC_AUTH_SESSION_COOKIE } from "@/lib/public-auth";
import { getOverlayAccessStatus } from "@/lib/overlay-access";
import { AccessGate } from "@/app/overlay/admin/AccessGate";
import { getJungmanState } from "@/lib/jungman";
import type { NewsTable } from "@/components/starnews/news-types";
import NewsAdminClient from "./NewsAdminClient";

export const dynamic = "force-dynamic";

// 중만컵 순위 프리셋 — 표 편집기의 "불러오기" 버튼용. 실패해도 관리자 페이지는 살아야 한다.
async function loadJungmanPreset(): Promise<NewsTable | null> {
  try {
    const state = await getJungmanState();
    const rows = state.standings
      .filter((s) => s.rank !== null)
      .sort((a, b) => (a.rank ?? 0) - (b.rank ?? 0))
      .map((s) => [
        String(s.rank ?? ""),
        s.team.short || s.team.name,
        (s.votes ?? 0).toLocaleString("ko-KR"),
      ]);
    if (!rows.length) return null;
    return {
      title: "중만컵 인기투표 순위",
      subtitle: "",
      columns: ["순위", "대학", "표"],
      rows,
      highlightRows: [],
    };
  } catch {
    return null;
  }
}

export default async function NewsAdminPage() {
  const cookieStore = await cookies();
  const session = parsePublicAuthSessionCookieValue(
    cookieStore.get(PUBLIC_AUTH_SESSION_COOKIE)?.value
  );

  if (!session) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center gap-4 p-8 text-center">
        <h1 className="text-lg font-black text-white/90">방송 뉴스 오버레이</h1>
        <p className="max-w-md text-sm leading-relaxed text-white/55">
          스트리머·실제 매니저분들을 위한 방송 오버레이 도구입니다.<br />
          현재 테스트 기간이라 일부 사용자에게만 열려 있어요. 숲티비로 로그인 후 신청할 수 있습니다.
        </p>
        <a
          href="/api/auth/soop/start?next=/overlay/news/admin"
          className="rounded-lg bg-nzu-green px-6 py-3 font-bold text-white hover:opacity-80"
        >
          숲티비로 로그인
        </a>
      </div>
    );
  }

  const access = await getOverlayAccessStatus(session.providerUserId);
  if (access === "none" || access === "pending") {
    return <AccessGate initialStatus={access} displayName={session.displayName} />;
  }

  const jungmanPreset = await loadJungmanPreset();

  return (
    <>
      {/* 슬라이더·표 편집 위주라 좁은 화면에선 조작이 안 됨 — 모바일은 안내만 (A안) */}
      <div className="flex min-h-screen flex-col items-center justify-center gap-4 p-8 text-center lg:hidden">
        <h1 className="text-lg font-black text-white/90">방송 뉴스 오버레이</h1>
        <p className="max-w-md text-sm leading-relaxed text-white/55">
          뉴스 오버레이 관리 도구는 PC 화면 전용입니다.<br />
          PC 브라우저로 접속해 주세요.
        </p>
      </div>
      <div className="hidden lg:block">
        <NewsAdminClient jungmanPreset={jungmanPreset} />
      </div>
    </>
  );
}
