import Image from "next/image";
import Link from "next/link";
import { cookies } from "next/headers";
import { notFound } from "next/navigation";
import { after } from "next/server";
import { ArrowLeft, ChevronLeft, ChevronRight, ImageIcon, Pencil, PlayCircle } from "lucide-react";

import { BoardComments } from "@/components/board/BoardComments";
import { BoardPostDeleteButton } from "@/components/board/BoardPostDeleteButton";
import { ADMIN_SESSION_COOKIE, isValidAdminSession } from "@/lib/admin-auth";
import {
  buildVideoEmbedUrl,
  getAdjacentBoardPosts,
  getBoardCategoryLabel,
  getBoardCategoryTone,
  getBoardPostById,
  incrementBoardPostView,
} from "@/lib/board";
import { buildBoardCommentAuthorId, listVisibleBoardComments } from "@/lib/board-comments";
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
  const resolvedSearchParams = searchParams ?? Promise.resolve({} as Record<string, string | string[] | undefined>);
  const [post, commentsResult, cookieStore, paramsData] = await Promise.all([
    getBoardPostById(id),
    listVisibleBoardComments(id),
    cookies(),
    resolvedSearchParams,
  ]);

  const adjacent = post ? await getAdjacentBoardPosts(post.created_at ?? "", post.id) : { prev: null, next: null };

  if (!post) {
    notFound();
  }

  after(() => incrementBoardPostView(id));

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
  const downloadStatus = typeof paramsData.download === "string" ? paramsData.download : "";
  const renderedContent = renderBoardContentToHtml(post.content);
  const currentAuthorId = session ? buildBoardCommentAuthorId(session.provider, session.providerUserId) : null;

  return (
    <div className="min-h-screen bg-background text-foreground">
      <main className="mx-auto flex w-full max-w-5xl flex-col gap-5 px-4 py-8 md:px-8">
        <section className="rounded-[1.5rem] border border-white/12 bg-[linear-gradient(180deg,rgba(13,21,23,0.98),rgba(8,13,14,0.96))] shadow-[0_22px_70px_rgba(0,0,0,0.18)]">
          <div className="flex flex-wrap items-center gap-2 border-b border-white/12 px-5 py-4 text-sm font-bold text-white/56">
            <Link href="/board" prefetch={false} className="transition hover:text-white">
              게시판
            </Link>
            <span>/</span>
            <span>전체글</span>
          </div>

          <div className="flex flex-col gap-4 px-5 py-5">
            <div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-2">
                  {categoryLabel ? (
                    <span className={`text-sm font-semibold ${categoryTone}`}>{categoryLabel}</span>
                  ) : null}
                  <h1 className="text-2xl font-bold tracking-tight text-white md:text-3xl">{post.title}</h1>
                  {post.image_url ? <ImageIcon size={16} className="text-white/40" /> : null}
                  {post.video_url ? <PlayCircle size={16} className="text-white/40" /> : null}
                </div>
                <div className="mt-4 flex flex-wrap items-center gap-x-5 gap-y-2 border-t border-white/10 pt-3 text-sm font-semibold text-white/66">
                  <span>{post.author_name}</span>
                  <span>{formatDetailDate(post.created_at)}</span>
                </div>
              </div>
              <div className="flex shrink-0 items-center gap-2">
                {canEdit ? (
                  <Link
                    href={`/board/${post.id}/edit`}
                    className="inline-flex min-h-9 items-center justify-center gap-1.5 rounded-xl border border-white/18 bg-white/[0.04] px-4 text-sm font-semibold text-white transition hover:border-white/30 hover:bg-white/[0.08]"
                  >
                    <Pencil size={14} />
                    수정
                  </Link>
                ) : null}
                {canEdit ? <BoardPostDeleteButton postId={post.id} /> : null}
                <Link
                  href="/board"
                  prefetch={false}
                  className="inline-flex min-h-9 items-center justify-center gap-1.5 rounded-xl border border-white/18 bg-white/[0.04] px-4 text-sm font-semibold text-white transition hover:border-white/30 hover:bg-white/[0.08]"
                >
                  <ArrowLeft size={14} />
                  목록
                </Link>
              </div>
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

        <article className="rounded-[1.6rem] border border-white/12 bg-[linear-gradient(180deg,rgba(13,21,23,0.98),rgba(8,13,14,0.96))] p-6 shadow-[0_22px_70px_rgba(0,0,0,0.18)]">
          <div
            className="max-w-none space-y-4 text-base font-medium leading-8 text-white/84 [&_a]:font-bold [&_blockquote]:my-0 [&_code]:font-semibold [&_ol]:my-0 [&_p]:my-0 [&_strong]:text-white [&_ul]:my-0"
            dangerouslySetInnerHTML={{ __html: renderedContent }}
          />

          {post.image_url ? (
            <div className="mt-6 overflow-hidden rounded-[1.2rem] border border-white/8 bg-black/20">
              <Image
                src={post.image_url}
                alt={post.title}
                width={1280}
                height={720}
                sizes="(max-width: 1280px) 100vw, 1280px"
                className="mx-auto h-auto max-h-[720px] w-auto max-w-full object-contain"
              />
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

          {post.external_link_url ? (
            <div className="mt-6">
              <a
                href={post.external_link_url}
                target="_blank"
                rel="noreferrer"
                className="inline-flex min-h-11 items-center justify-center rounded-xl border border-nzu-green/30 bg-nzu-green/10 px-5 text-sm font-semibold text-nzu-green transition hover:bg-nzu-green hover:text-black"
              >
                링크 열기
              </a>
            </div>
          ) : null}

          {post.download_url ? (
            <div className="mt-6">
              <a
                href={`/api/board/download?id=${encodeURIComponent(post.id)}&next=${encodeURIComponent(`/board/${post.id}`)}`}
                className="inline-flex min-h-11 items-center justify-center rounded-xl border border-white/12 bg-white/[0.03] px-5 text-sm font-semibold text-white transition hover:border-nzu-green/40 hover:text-nzu-green"
              >
                다운로드
              </a>
            </div>
          ) : null}
        </article>

        <BoardComments
          postId={post.id}
          initialComments={commentsResult.comments}
          storageReady={commentsResult.storageReady}
          session={session}
          currentAuthorId={currentAuthorId}
          isAdmin={isAdmin}
        />

        {(adjacent.prev || adjacent.next) && (
          <nav className="rounded-[1.5rem] border border-white/10 bg-[linear-gradient(180deg,rgba(13,21,23,0.98),rgba(8,13,14,0.96))] divide-y divide-white/8 shadow-[0_22px_70px_rgba(0,0,0,0.18)]">
            {adjacent.next && (
              <Link
                href={`/board/${adjacent.next.id}`}
                prefetch={false}
                className="flex items-center gap-3 px-5 py-4 transition hover:bg-white/[0.03] rounded-t-[1.5rem]"
              >
                <span className="flex shrink-0 items-center gap-1 text-xs font-bold text-white/38">
                  <ChevronLeft size={13} />
                  이전글
                </span>
                <span className="truncate text-sm font-semibold text-white/80 hover:text-white">
                  {adjacent.next.title}
                </span>
              </Link>
            )}
            {adjacent.prev && (
              <Link
                href={`/board/${adjacent.prev.id}`}
                prefetch={false}
                className="flex items-center gap-3 px-5 py-4 transition hover:bg-white/[0.03] rounded-b-[1.5rem]"
              >
                <span className="flex shrink-0 items-center gap-1 text-xs font-bold text-white/38">
                  다음글
                  <ChevronRight size={13} />
                </span>
                <span className="truncate text-sm font-semibold text-white/80 hover:text-white">
                  {adjacent.prev.title}
                </span>
              </Link>
            )}
          </nav>
        )}
      </main>
    </div>
  );
}
