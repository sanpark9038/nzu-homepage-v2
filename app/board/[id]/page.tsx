import Link from "next/link";
import { cookies } from "next/headers";
import { notFound } from "next/navigation";
import { ImageIcon, MessageCircleMore, Pencil, PlayCircle } from "lucide-react";

import { BoardPostDeleteButton } from "@/components/board/BoardPostDeleteButton";
import { ADMIN_SESSION_COOKIE, isValidAdminSession } from "@/lib/admin-auth";
import {
  buildVideoEmbedUrl,
  getBoardCategoryLabel,
  getBoardCategoryTone,
  getBoardPostById,
} from "@/lib/board";
import { renderBoardContentToHtml } from "@/lib/board-content";
import { parsePublicAuthSessionCookieValue, PUBLIC_AUTH_SESSION_COOKIE } from "@/lib/public-auth";

export const runtime = "nodejs";
export const revalidate = 0;

function formatDetailDate(value: string | null) {
  if (!value) return "-";

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "-";

  return new Intl.DateTimeFormat("ko-KR", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  }).format(date);
}

export default async function BoardDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
}) {
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
  const embedUrl = buildVideoEmbedUrl(post.video_url);
  const categoryLabel = getBoardCategoryLabel(post.category);
  const categoryTone = getBoardCategoryTone(post.category);
  const paramsData = ((await searchParams) || {}) as Record<string, string | string[] | undefined>;
  const downloadStatus = typeof paramsData.download === "string" ? paramsData.download : "";
  const renderedContent = renderBoardContentToHtml(post.content);

  return (
    <div className="min-h-screen bg-background text-foreground">
      <main className="mx-auto flex w-full max-w-5xl flex-col gap-5 px-4 py-8 md:px-8">
        <section className="rounded-[1.5rem] border border-white/8 bg-[linear-gradient(180deg,rgba(10,16,18,0.98),rgba(7,10,11,0.94))] p-5 shadow-[0_22px_70px_rgba(0,0,0,0.16)]">
          <div className="flex flex-wrap items-center gap-2 text-sm font-bold text-white/42">
            <Link href="/board" className="transition hover:text-white">
              게시판
            </Link>
            <span>/</span>
            <span>전체글</span>
          </div>

          <div className="mt-4 flex flex-col gap-4 border-t border-white/6 pt-4">
            <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-2">
                  {categoryLabel ? (
                    <span className={`text-sm font-black ${categoryTone}`}>{categoryLabel}</span>
                  ) : null}
                  <h1 className="text-3xl font-black tracking-[-0.04em] text-white">{post.title}</h1>
                  {post.image_url ? <ImageIcon size={16} className="text-white/40" /> : null}
                  {post.video_url ? <PlayCircle size={16} className="text-white/40" /> : null}
                </div>
                <div className="mt-4 flex flex-wrap items-center gap-x-5 gap-y-2 text-sm font-medium text-white/55">
                  <span>{post.author_name}</span>
                  <span>{formatDetailDate(post.created_at)}</span>
                  <span>조회수 -</span>
                  <span>추천수 -</span>
                </div>
              </div>
              {canEdit ? (
                <Link
                  href={`/board/${post.id}/edit`}
                  className="inline-flex min-h-11 items-center justify-center gap-2 rounded-xl border border-white/12 bg-white/[0.03] px-5 text-sm font-black text-white transition hover:border-white/22 hover:bg-white/[0.06]"
                >
                  <Pencil size={16} />
                  수정
                </Link>
              ) : null}
              {canEdit ? <BoardPostDeleteButton postId={post.id} /> : null}
              <Link
                href="/board"
                className="inline-flex min-h-11 items-center justify-center rounded-xl border border-white/12 bg-white/[0.03] px-5 text-sm font-black text-white transition hover:border-white/22 hover:bg-white/[0.06]"
              >
                게시판으로 돌아가기
              </Link>
            </div>
          </div>
        </section>

        {downloadStatus ? (
          <section className="rounded-[1.35rem] border border-amber-300/18 bg-amber-300/8 px-5 py-4 text-sm font-medium text-amber-100/88">
            {downloadStatus === "invalid" ? "다운로드 링크 형식이 올바르지 않습니다." : "다운로드 링크를 확인하지 못했습니다."}
          </section>
        ) : null}

        {!session && post.download_url ? (
          <section className="rounded-[1.35rem] border border-white/8 bg-white/[0.03] px-5 py-4 text-sm font-medium text-white/68">
            다운로드는 숲티비 로그인 후 사용할 수 있습니다. 로그인 후 현재 글 위치로 다시 돌아옵니다.
          </section>
        ) : null}

        <article className="rounded-[1.6rem] border border-white/8 bg-[linear-gradient(180deg,rgba(10,16,18,0.98),rgba(7,10,11,0.94))] p-6 shadow-[0_22px_70px_rgba(0,0,0,0.16)]">
          <div
            className="max-w-none space-y-3 text-[15px] font-medium leading-8 text-white/78 [&_a]:font-bold [&_blockquote]:my-0 [&_code]:font-semibold [&_ol]:my-0 [&_p]:my-0 [&_strong]:text-white [&_ul]:my-0"
            dangerouslySetInnerHTML={{ __html: renderedContent }}
          />

          {post.image_url ? (
            <div className="mt-6 overflow-hidden rounded-[1.2rem] border border-white/8 bg-black/20">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={post.image_url} alt={post.title} className="mx-auto h-auto max-h-[720px] max-w-full object-contain" />
            </div>
          ) : null}

          {embedUrl ? (
            <div className="mt-6 overflow-hidden rounded-[1.2rem] border border-white/8 bg-black">
              <div className="aspect-video w-full">
                <iframe
                  src={embedUrl}
                  title={`${post.title} video`}
                  className="h-full w-full"
                  allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
                  allowFullScreen
                />
              </div>
            </div>
          ) : null}

          {post.download_url ? (
            <div className="mt-6">
              <a
                href={`/api/board/download?id=${encodeURIComponent(post.id)}&next=${encodeURIComponent(`/board/${post.id}`)}`}
                className="inline-flex min-h-11 items-center justify-center rounded-xl border border-white/12 bg-white/[0.03] px-5 text-sm font-black text-white transition hover:border-nzu-green/40 hover:text-nzu-green"
              >
                다운로드
              </a>
            </div>
          ) : null}
        </article>

        <section className="rounded-[1.6rem] border border-white/8 bg-[linear-gradient(180deg,rgba(10,16,18,0.98),rgba(7,10,11,0.94))] p-5 shadow-[0_22px_70px_rgba(0,0,0,0.16)]">
          <div className="flex items-center gap-2 text-sm font-black tracking-tight text-white">
            <MessageCircleMore size={18} className="text-white/60" />
            <span>댓글</span>
            <span className="text-white/32">0</span>
          </div>
          <div className="mt-4 rounded-[1.2rem] border border-dashed border-white/10 bg-white/[0.02] px-4 py-10 text-center">
            <div className="text-sm font-black uppercase tracking-[0.18em] text-white/30">Coming Soon</div>
            <p className="mt-3 text-sm font-medium text-white/58">댓글 기능은 준비중입니다. 현재는 게시글 읽기와 다운로드 흐름을 먼저 안정화하고 있습니다.</p>
          </div>
        </section>
      </main>
    </div>
  );
}
