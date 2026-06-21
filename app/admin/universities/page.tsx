import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { AdminNav } from "@/components/admin/AdminNav";
import ManualTeamManager from "@/components/admin/roster/ManualTeamManager";
import { ADMIN_SESSION_COOKIE, isValidAdminSession } from "@/lib/admin-auth";
import { getUniversityOptionsFromDB } from "@/lib/university-metadata";
import LogoutButton from "../ops/LogoutButton";
import UniversityAdmin from "./UniversityAdmin";

export const dynamic = "force-dynamic";

export default async function AdminUniversitiesPage() {
  const cookieStore = await cookies();
  const sessionValue = cookieStore.get(ADMIN_SESSION_COOKIE)?.value;
  if (!isValidAdminSession(sessionValue)) {
    redirect("/admin/login?next=/admin/universities");
  }

  const universities = await getUniversityOptionsFromDB(true);

  return (
    <main className="min-h-screen bg-background p-6 text-foreground md:p-10">
      <div className="mx-auto flex max-w-6xl flex-col gap-8">
        <div className="flex items-center justify-between">
          <AdminNav />
          <LogoutButton />
        </div>

        <section className="flex flex-col gap-6">
          <div className="space-y-1">
            <h1 className="text-3xl font-black tracking-tight text-white">대학 관리</h1>
            <p className="text-sm text-white/55">
              티어표·엔트리 대학 목록의 표시명, 별칭, 숨김 여부를 설정합니다. 변경 사항은 즉시 반영됩니다.
            </p>
          </div>
          <UniversityAdmin initialUniversities={universities} />
        </section>

        <div className="border-t border-white/8" />

        <section className="flex flex-col gap-6">
          <div className="space-y-1">
            <h1 className="text-3xl font-black tracking-tight text-white">수동 팀 관리</h1>
            <p className="text-sm text-white/55">
              eloboard에 아직 수집되지 않은 팀을 미리 만들어두는 기능입니다. 생성 후 로스터 교정에서 선수를 배치합니다.
            </p>
          </div>
          <ManualTeamManager />
        </section>
      </div>
    </main>
  );
}
