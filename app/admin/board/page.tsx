import { cookies } from "next/headers";
import { redirect } from "next/navigation";

import { AdminNav } from "@/components/admin/AdminNav";
import { AdminBoardPostList } from "@/components/admin/board/AdminBoardPostList";
import { ADMIN_SESSION_COOKIE, isValidAdminSession } from "@/lib/admin-auth";
import { isBoardStorageMissing, listAdminBoardPosts, type BoardPostRow } from "@/lib/board";

export const dynamic = "force-dynamic";

export default async function AdminBoardPage() {
  const cookieStore = await cookies();
  if (!isValidAdminSession(cookieStore.get(ADMIN_SESSION_COOKIE)?.value)) {
    redirect("/admin/login?next=/admin/board");
  }

  let posts: BoardPostRow[] = [];
  let storageReady = true;

  try {
    posts = await listAdminBoardPosts(200);
  } catch (error) {
    if (isBoardStorageMissing(error)) {
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
          <div className="text-[11px] font-black uppercase tracking-[0.24em] text-nzu-green">Board</div>
          <h1 className="mt-3 text-3xl font-black tracking-tight text-white">게시판 관리</h1>
          <p className="mt-2 text-sm font-medium leading-7 text-white/58">
            전체 게시글을 한 화면에서 확인하고 삭제할 수 있습니다. 댓글 삭제는 각 글 상세 페이지에서 처리합니다.
          </p>
        </header>

        {!storageReady ? (
          <section className="rounded-[1.35rem] border border-amber-300/18 bg-amber-300/8 px-5 py-4 text-sm font-medium text-amber-100/90">
            board_posts 저장소를 사용할 수 없습니다. SQL 적용 상태를 확인해 주세요.
          </section>
        ) : null}

        <AdminBoardPostList posts={posts} />
      </div>
    </main>
  );
}
