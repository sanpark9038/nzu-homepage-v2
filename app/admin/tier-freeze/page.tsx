import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { AdminNav } from "@/components/admin/AdminNav";
import { ADMIN_SESSION_COOKIE, isValidAdminSession } from "@/lib/admin-auth";
import { readSettingAdmin } from "@/lib/site-settings-admin";
import { parseTierFreeze, TIER_FREEZE_KEY } from "@/lib/tier-freeze";
import LogoutButton from "../ops/LogoutButton";
import TierFreezeAdmin from "./TierFreezeAdmin";

export const dynamic = "force-dynamic";

async function loadFreezeState() {
  try {
    const freeze = parseTierFreeze(await readSettingAdmin(TIER_FREEZE_KEY));
    if (!freeze) return null;
    return { active: true, frozenAt: freeze.frozenAt, playerCount: Object.keys(freeze.snapshot).length };
  } catch (error) {
    console.error("failed to load tier freeze", error);
    return null;
  }
}

export default async function AdminTierFreezePage() {
  const cookieStore = await cookies();
  const sessionValue = cookieStore.get(ADMIN_SESSION_COOKIE)?.value;

  if (!isValidAdminSession(sessionValue)) {
    redirect("/admin/login?next=/admin/tier-freeze");
  }

  const initialFreeze = await loadFreezeState();

  return (
    <main className="min-h-screen bg-background p-6 text-foreground md:p-10">
      <div className="mx-auto flex max-w-6xl flex-col gap-6">
        <div className="flex items-center justify-between">
          <AdminNav />
          <LogoutButton />
        </div>

        <div className="space-y-2">
          <h1 className="text-3xl font-black tracking-tight text-white">티어 동결</h1>
          <p className="text-sm text-white/55">
            대회 기간 동안 선수 검색 카드에 승급 전 티어를 그대로 보여줍니다. 라이브 티어표(/tier)에는 영향이 없습니다.
          </p>
        </div>

        <TierFreezeAdmin initialFreeze={initialFreeze} />
      </div>
    </main>
  );
}
