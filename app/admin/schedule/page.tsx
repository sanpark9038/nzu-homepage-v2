import { cookies } from "next/headers";
import { redirect } from "next/navigation";

import { AdminNav } from "@/components/admin/AdminNav";
import { SchedulePostComposer } from "@/components/admin/schedule/SchedulePostComposer";
import { ADMIN_SESSION_COOKIE, isValidAdminSession } from "@/lib/admin-auth";
import { isScheduleInfoStorageMissing, listAdminScheduleInfoPosts, type BoardPostRow } from "@/lib/board";

export const dynamic = "force-dynamic";

export default async function AdminSchedulePage() {
  const cookieStore = await cookies();
  if (!isValidAdminSession(cookieStore.get(ADMIN_SESSION_COOKIE)?.value)) {
    redirect("/admin/login?next=/admin/schedule");
  }

  let existingPosts: BoardPostRow[] = [];
  let storageReady = true;

  try {
    const schedule = await listAdminScheduleInfoPosts(50);
    existingPosts = schedule.posts;
  } catch (error) {
    if (isScheduleInfoStorageMissing(error)) {
      storageReady = false;
    } else {
      throw error;
    }
  }

  return (
    <main className="min-h-screen bg-background p-6 text-foreground md:p-10">
      <div className="mx-auto max-w-6xl space-y-6">
        <AdminNav />
        <header>
          <div className="text-[11px] font-black uppercase tracking-[0.24em] text-nzu-green">Schedule</div>
          <h1 className="mt-3 text-3xl font-black tracking-tight text-white">정보/일정 관리</h1>
          <p className="mt-2 text-sm font-medium leading-7 text-white/58">
            게시판 글과 일정 페이지에 함께 표시될 관리자 전용 정보/일정을 등록합니다.
          </p>
        </header>

        {!storageReady ? (
          <section className="rounded-[1.35rem] border border-amber-300/18 bg-amber-300/8 px-5 py-4 text-sm font-medium text-amber-100/90">
            board_posts 일정 컬럼이 아직 준비되지 않았습니다. SQL 적용 전에는 등록과 수정이 제한됩니다.
          </section>
        ) : null}

        <SchedulePostComposer existingPosts={existingPosts} />
      </div>
    </main>
  );
}
