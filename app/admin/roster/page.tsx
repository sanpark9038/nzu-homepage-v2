import Link from "next/link";
import { AdminNav } from "@/components/admin/AdminNav";
import RosterCorrectionEditor from "@/components/admin/roster/RosterCorrectionEditor";
import { isAdminWriteDisabled } from "@/lib/admin-runtime";
import LogoutButton from "../ops/LogoutButton";

export const dynamic = "force-dynamic";

export default function AdminRosterPage() {
  const readOnly = isAdminWriteDisabled();

  return (
    <main className="min-h-screen bg-background p-6 text-foreground md:p-10">
      <div className="mx-auto flex max-w-5xl flex-col gap-6">
        <AdminNav />

        <div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
          <div>
            <h1 className="text-2xl font-black tracking-tight md:text-3xl">로스터 교정</h1>
            <p className="mt-2 text-sm text-muted-foreground">
              선수의 소속, 티어, 수집 제외 여부를 운영 기준에 맞게 직접 교정하는 페이지입니다.
            </p>
          </div>
          <div className="flex gap-3">
            <LogoutButton />
          </div>
        </div>

        <div className="rounded-lg border border-border bg-background px-4 py-3 text-xs text-muted-foreground">
          1. 선수를 검색합니다. 2. 교정 또는 제외 작업을 선택합니다. 3. 저장합니다.
        </div>

        <div className="flex flex-wrap items-center gap-2 rounded-lg border border-border bg-card px-4 py-3 text-sm text-muted-foreground">
          <span>이 페이지는 일반 선수 교정 전용입니다.</span>
          <Link href="/admin/roster/teams" className="font-semibold text-nzu-green underline underline-offset-4">
            수동 팀 생성/삭제는 별도 페이지에서 관리
          </Link>
        </div>

        <section className="grid gap-3 rounded-lg border border-border bg-card p-4 text-sm text-muted-foreground md:grid-cols-3">
          <div>
            <p className="font-semibold text-foreground">1. 선수 선택</p>
            <p className="mt-1">팀, 티어, 제외 상태를 확인할 선수를 검색해서 고릅니다.</p>
          </div>
          <div>
            <p className="font-semibold text-foreground">2. 운영 교정</p>
            <p className="mt-1">소속, 티어, 수동 모드, 수집 제외 여부를 운영 기준으로 바로잡습니다.</p>
          </div>
          <div>
            <p className="font-semibold text-foreground">3. 파이프라인 반영</p>
            <p className="mt-1">여기서 저장한 교정값은 다음 파이프라인에서도 우선 기준으로 사용됩니다.</p>
          </div>
        </section>

        <RosterCorrectionEditor readOnly={readOnly} />
      </div>
    </main>
  );
}
