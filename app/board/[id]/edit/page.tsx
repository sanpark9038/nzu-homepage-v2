import Link from "next/link";
import { cookies } from "next/headers";
import { notFound } from "next/navigation";

import { BoardPostEditForm } from "@/components/board/BoardPostEditForm";
import { ADMIN_SESSION_COOKIE, isValidAdminSession } from "@/lib/admin-auth";
import { getBoardPostById } from "@/lib/board";
import { parsePublicAuthSessionCookieValue, PUBLIC_AUTH_SESSION_COOKIE } from "@/lib/public-auth";

export const runtime = "nodejs";
export const revalidate = 0;

export default async function BoardPostEditPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const post = await getBoardPostById(id);
  if (!post) {
    notFound();
  }

  const cookieStore = await cookies();
  const session = parsePublicAuthSessionCookieValue(cookieStore.get(PUBLIC_AUTH_SESSION_COOKIE)?.value);
  const isAdmin = isValidAdminSession(cookieStore.get(ADMIN_SESSION_COOKIE)?.value);
  const canEdit =
    isAdmin ||
    Boolean(
      session &&
        post.author_provider &&
        post.author_provider_user_id &&
        session.provider === post.author_provider &&
        session.providerUserId === post.author_provider_user_id
    );

  return (
    <div className="min-h-screen bg-background text-foreground">
      <main className="mx-auto flex w-full max-w-5xl flex-col gap-5 px-4 py-8 md:px-8">
        <section className="rounded-[1.5rem] border border-white/8 bg-[linear-gradient(180deg,rgba(10,16,18,0.98),rgba(7,10,11,0.94))] p-5 shadow-[0_22px_70px_rgba(0,0,0,0.16)]">
          <div className="flex flex-wrap items-center gap-2 text-sm font-bold text-white/42">
            <Link href="/board" className="transition hover:text-white">
              게시판
            </Link>
            <span>/</span>
            <Link href={`/board/${post.id}`} className="transition hover:text-white">
              전체글
            </Link>
          </div>
          <div className="mt-4 border-t border-white/6 pt-4">
            <h1 className="text-3xl font-black tracking-[-0.04em] text-white">글 수정</h1>
          </div>
        </section>

        {canEdit ? (
          <BoardPostEditForm
            post={{
              id: post.id,
              title: post.title,
              content: post.content,
              image_url: post.image_url,
              video_url: post.video_url,
            }}
          />
        ) : (
          <section className="rounded-[1.6rem] border border-white/8 bg-[linear-gradient(180deg,rgba(10,16,18,0.98),rgba(7,10,11,0.94))] p-6 text-sm font-bold text-white/68 shadow-[0_22px_70px_rgba(0,0,0,0.16)]">
            이 게시글을 수정할 권한이 없습니다.
          </section>
        )}
      </main>
    </div>
  );
}
