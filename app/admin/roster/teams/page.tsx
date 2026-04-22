import Link from "next/link";
import { AdminNav } from "@/components/admin/AdminNav";
import ManualTeamManager from "@/components/admin/roster/ManualTeamManager";
import { isAdminWriteDisabled } from "@/lib/admin-runtime";
import LogoutButton from "../../ops/LogoutButton";

export const dynamic = "force-dynamic";

export default function AdminRosterTeamsPage() {
  const readOnly = isAdminWriteDisabled();

  return (
    <main className="min-h-screen bg-background p-6 text-foreground md:p-10">
      <div className="mx-auto flex max-w-5xl flex-col gap-6">
        <AdminNav />

        <div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
          <div>
            <h1 className="text-2xl font-black tracking-tight md:text-3xl">수동 팀 관리</h1>
            <p className="mt-2 text-sm text-muted-foreground">
              운영자가 직접 만든 팀을 추가하거나 정리하는 전용 페이지입니다.
            </p>
          </div>
          <div className="flex gap-3">
            <LogoutButton />
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2 rounded-lg border border-border bg-card px-4 py-3 text-sm text-muted-foreground">
          <span>선수 소속, 티어, 제외/복구 교정은</span>
          <Link href="/admin/roster" className="font-semibold text-nzu-green underline underline-offset-4">
            로스터 교정
          </Link>
          <span>페이지에서 진행합니다.</span>
        </div>

        <ManualTeamManager readOnly={readOnly} />
      </div>
    </main>
  );
}
