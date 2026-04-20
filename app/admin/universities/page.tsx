import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { AdminNav } from "@/components/admin/AdminNav";
import { ADMIN_SESSION_COOKIE, isValidAdminSession } from "@/lib/admin-auth";
import { getUniversityOptions } from "@/lib/university-metadata";
import LogoutButton from "../ops/LogoutButton";
import UniversityAdmin from "./UniversityAdmin";

export const dynamic = "force-dynamic";

export default async function AdminUniversitiesPage() {
  const cookieStore = await cookies();
  const sessionValue = cookieStore.get(ADMIN_SESSION_COOKIE)?.value;
  if (!isValidAdminSession(sessionValue)) {
    redirect("/admin/login?next=/admin/universities");
  }

  const universities = getUniversityOptions(true);

  return (
    <main className="min-h-screen bg-background text-foreground p-6 md:p-10">
      <div className="mx-auto flex max-w-6xl flex-col gap-6">
        <div className="flex items-center justify-between">
          <AdminNav />
          <LogoutButton />
        </div>

        <div className="space-y-2">
          <h1 className="text-3xl font-black tracking-tight text-white">대학 관리</h1>
          <p className="text-sm text-white/55">
            `/tier`와 `/entry` 학교 목록에 쓰이는 대학 메타데이터를 직접 추가, 수정, 숨김 처리할 수 있습니다.
          </p>
        </div>

        <UniversityAdmin initialUniversities={universities} />
      </div>
    </main>
  );
}
