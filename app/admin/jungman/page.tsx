import { cookies } from "next/headers";
import { redirect } from "next/navigation";

import { AdminNav } from "@/components/admin/AdminNav";
import { ADMIN_SESSION_COOKIE, isValidAdminSession } from "@/lib/admin-auth";
import { getJungmanState } from "@/lib/jungman";
import { JUNGMAN_STANDINGS_KEY } from "@/lib/jungman-standings";
import { readSettingAdmin } from "@/lib/site-settings-admin";
import LogoutButton from "../ops/LogoutButton";
import JungmanAdmin from "./JungmanAdmin";
import JungmanStandingsAdmin from "./JungmanStandingsAdmin";

export const dynamic = "force-dynamic";

export default async function AdminJungmanPage() {
  const cookieStore = await cookies();
  const sessionValue = cookieStore.get(ADMIN_SESSION_COOKIE)?.value;

  if (!isValidAdminSession(sessionValue)) {
    redirect("/admin/login?next=/admin/jungman");
  }

  const { config, snapshots } = await getJungmanState();
  // 순위 데이터를 못 읽어도 개표 관리는 열려야 한다 — 진짜 원인은 저장 시도에서 그대로 뜬다
  const standings = await readSettingAdmin(JUNGMAN_STANDINGS_KEY).catch(() => "");

  return (
    <main className="min-h-screen bg-background p-6 text-foreground md:p-10">
      <div className="mx-auto flex max-w-6xl flex-col gap-6">
        <div className="flex items-center justify-between">
          <AdminNav />
          <LogoutButton />
        </div>

        <div className="space-y-2">
          <h1 className="text-3xl font-black tracking-tight text-white">K-중만컵 개표 관리</h1>
          <p className="text-sm text-white/55">
            차수별 득표수를 입력하면 공개 페이지(/jungman)의 지도 · 순위 보드 · 추이 그래프가 함께 갱신됩니다.
          </p>
        </div>

        <JungmanAdmin initialConfig={config} initialSnapshots={snapshots} />
        <JungmanStandingsAdmin initialValue={standings ?? ""} />
      </div>
    </main>
  );
}
