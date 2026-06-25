import Link from "next/link";
import { ImageIcon, PlayCircle, SquarePen } from "lucide-react";

import {
  type BoardPostWithCommentCount,
  getBoardCategoryLabel,
  getBoardCategoryTone,
  getCachedBoardPostsWithCommentCounts,
  hasBoardMedia,
  type BoardListFilter,
} from "@/lib/board";
import { ChevronLeft, ChevronRight } from "lucide-react";

export const runtime = "nodejs";
export const revalidate = 30;

export function formatBoardListDate(value: string | null) {
  if (!value) return "-";

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "-";

  const timeZone = "Asia/Seoul";
  const dateKeyFormatter = new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  });
  const now = new Date();
  const sameDay = dateKeyFormatter.format(date) === dateKeyFormatter.format(now);

  return new Intl.DateTimeFormat("ko-KR", sameDay
    ? { timeZone, hour: "2-digit", minute: "2-digit", hour12: false }
    : { timeZone, year: "2-digit", month: "2-digit", day: "2-digit" }).format(date);
}

function formatScheduleTime(value: string | null | undefined) {
  const [hour = "", minute = ""] = String(value || "").split(":");
  if (!/^\d{2}$/.test(hour) || !/^\d{2}$/.test(minute)) return "";
  return `${hour}:${minute}`;
}

export function formatBoardScheduleBadge(post: BoardPostWithCommentCount) {
  if (post.category !== "schedule" || !post.schedule_date) return "";
  const match = post.schedule_date.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!match) return "";
  const [, , month, day] = match;
  const timeLabel = formatScheduleTime(post.schedule_start_time);
  return timeLabel ? `${month}.${day} ${timeLabel}` : `${month}.${day}`;
}

function boardRowClassName(post: BoardPostWithCommentCount) {
  const base = "border-b border-white/6 text-white/78 transition";
  if (post.category === "schedule") {
    return `${base} bg-sky-300/[0.035] hover:bg-sky-300/[0.07]`;
  }
  return `${base} hover:bg-white/[0.025]`;
}

function renderWriteAction(className: string) {
  return (
    <Link href="/board/write" prefetch={false} className={className}>
      <SquarePen size={16} />
      <span>글쓰기</span>
    </Link>
  );
}

function boardFilterHref(filter: BoardListFilter) {
  return filter === "all" ? "/board" : `/board?filter=${filter}`;
}

function boardFilterTabClassName(active: boolean) {
  return active
    ? "rounded-lg bg-nzu-green/10 px-3 py-2 text-nzu-green transition hover:bg-nzu-green/15"
    : "rounded-lg bg-white/[0.03] px-3 py-2 text-white/42 transition hover:bg-white/[0.06] hover:text-white/72";
}

type BoardPageContentProps = {
  board: Awaited<ReturnType<typeof getCachedBoardPostsWithCommentCounts>>;
  boardFilter: BoardListFilter;
  page?: number;
  loginStatus?: string;
  downloadStatus?: string;
};

function buildPageHref(filter: BoardListFilter, page: number) {
  const params = new URLSearchParams();
  if (filter !== "all") params.set("filter", filter);
  if (page > 1) params.set("page", String(page));
  const qs = params.toString();
  return qs ? `/board?${qs}` : "/board";
}

export function BoardPageContent({
  board,
  boardFilter,
  page = 1,
  loginStatus = "",
  downloadStatus = "",
}: BoardPageContentProps) {
  const hasPrev = page > 1;
  const hasNext = board.hasMore ?? false;
  return (
    <div className="min-h-screen bg-background text-foreground">
      <main className="mx-auto flex w-full max-w-6xl flex-col gap-5 px-4 py-8 md:px-8">
        <section className="hosaga-card p-5">
          <div className="flex flex-col gap-5 md:flex-row md:items-end md:justify-between">
            <div>
              <div className="ui-label uppercase text-nzu-green">Board</div>
              <h1 className="mt-3 text-4xl font-bold tracking-tight text-white">전체글</h1>
              <p className="mt-2 max-w-3xl text-sm font-medium leading-7 text-white/58">
                새 글과 소식을 한눈에 확인하세요. 글쓰기는 SOOP 로그인 후 사용할 수 있습니다.
              </p>
            </div>
            {renderWriteAction(
              "inline-flex min-h-12 items-center justify-center gap-2 rounded-xl bg-nzu-green px-5 text-sm font-bold text-black transition hover:-translate-y-0.5"
            )}
          </div>
        </section>

        {loginStatus ? (
          <section className="rounded-[1.35rem] border border-white/8 bg-white/[0.03] px-5 py-4 text-sm font-medium text-white/72">
            {loginStatus === "soop-userinfo-missing"
              ? "SOOP 로그인은 완료됐지만 사용자 식별 정보를 확정하지 못했습니다."
              : loginStatus === "soop-token-failed"
                ? "SOOP 로그인 토큰 교환이 정상적으로 완료되지 않았습니다."
                : loginStatus === "soop-state-mismatch"
                  ? "SOOP 로그인 상태 확인이 어긋났습니다. 다시 시도해 주세요."
                  : loginStatus === "logged-out"
                    ? "로그아웃되었습니다."
                    : loginStatus === "soop-not-configured"
                      ? "SOOP 로그인 설정이 아직 완료되지 않았습니다."
                      : "로그인 처리 중 다시 확인이 필요합니다."}
          </section>
        ) : null}

        {downloadStatus ? (
          <section className="rounded-[1.35rem] border border-amber-300/18 bg-amber-300/8 px-5 py-4 text-sm font-medium text-amber-100/88">
            {downloadStatus === "invalid"
              ? "다운로드 링크 형식이 올바르지 않습니다."
              : "다운로드 링크를 확인하지 못했습니다."}
          </section>
        ) : null}

        {!board.storageReady ? (
          <section className="rounded-[1.35rem] border border-amber-300/18 bg-amber-300/8 px-5 py-4 text-sm font-medium text-amber-100/90">
            `board_posts` 구성이 아직 현재 스펙과 맞지 않습니다. SQL 변경분을 다시 적용한 뒤 새로고침해 주세요.
          </section>
        ) : null}

        <section className="rounded-[1.6rem] border border-white/8 bg-[linear-gradient(180deg,rgba(11,17,19,0.98),rgba(7,9,10,0.96))] shadow-[0_22px_70px_rgba(0,0,0,0.16)]">
          <div className="flex flex-wrap items-center justify-between gap-3 border-b border-white/6 px-4 py-3 md:px-5">
            <div className="flex items-center gap-2 text-sm font-semibold [&>span]:hidden">
              <Link href={boardFilterHref("all")} prefetch={false} className={boardFilterTabClassName(boardFilter === "all")}>
                전체글
              </Link>
              <Link href={boardFilterHref("schedule")} prefetch={false} className={boardFilterTabClassName(boardFilter === "schedule")}>
                공지/일정
              </Link>
              <Link
                href={boardFilterHref("past-schedule")}
                prefetch={false}
                className={boardFilterTabClassName(boardFilter === "past-schedule")}
              >
                지난일정
              </Link>
              <span className="rounded-lg bg-nzu-green/10 px-3 py-2 text-nzu-green">전체글</span>
              <span className="rounded-lg bg-white/[0.03] px-3 py-2 text-white/42">공지/일정</span>
            </div>
          </div>

          <div className="overflow-x-auto">
            <table className="min-w-full border-collapse text-sm">
              <thead>
                <tr className="border-b border-white/6 bg-white/[0.02] text-left text-xs font-medium tracking-[0.12em] text-white/40">
                  <th className="w-[110px] px-4 py-3 md:px-5">말머리</th>
                  <th className="min-w-[420px] px-4 py-3">제목</th>
                  <th className="w-[160px] px-4 py-3">글쓴이</th>
                  <th className="w-[140px] px-4 py-3">날짜</th>
                  <th className="w-[90px] px-4 py-3 text-right">조회</th>
                </tr>
              </thead>
              <tbody>
                {board.posts.length ? (
                  board.posts.map((post) => {
                    const { hasImage, hasVideo } = hasBoardMedia(post);
                    const categoryLabel = getBoardCategoryLabel(post.category);
                    const categoryTone = getBoardCategoryTone(post.category);
                    const scheduleBadge = formatBoardScheduleBadge(post);

                    return (
                      <tr key={post.id} className={boardRowClassName(post)}>
                        <td
                          className={`border-l-2 px-4 py-3 text-sm font-semibold md:px-5 ${
                            post.category === "schedule" ? "border-sky-300/45" : "border-transparent"
                          } ${categoryTone}`}
                        >
                          {categoryLabel || <span aria-hidden="true">&nbsp;</span>}
                        </td>
                        <td className="px-4 py-3">
                          <Link
                            href={`/board/${post.id}`}
                            prefetch={false}
                            className="inline-flex max-w-full items-center gap-2 font-bold tracking-tight text-white transition hover:text-nzu-green"
                          >
                            {scheduleBadge ? (
                              <span className="inline-flex h-6 w-[6.9rem] shrink-0 items-center justify-center rounded-md border border-sky-300/28 bg-sky-300/12 px-2.5 text-xs font-semibold leading-none text-sky-100">
                                {scheduleBadge}
                              </span>
                            ) : null}
                            <span className="truncate">{post.title}</span>
                            {post.comment_count > 0 ? (
                              <span className="shrink-0 text-xs font-semibold text-nzu-green">[{post.comment_count}]</span>
                            ) : null}
                            {hasImage ? <ImageIcon size={14} className="shrink-0 text-white/45" /> : null}
                            {hasVideo ? <PlayCircle size={14} className="shrink-0 text-white/45" /> : null}
                          </Link>
                        </td>
                        <td className="px-4 py-3 text-sm font-semibold text-white/68">{post.author_name}</td>
                        <td className="px-4 py-3 text-sm text-white/54">{formatBoardListDate(post.created_at)}</td>
                        <td className="px-4 py-3 text-right text-sm text-white/46">-</td>
                      </tr>
                    );
                  })
                ) : (
                  <tr>
                    <td colSpan={5} className="px-4 py-16 text-center md:px-5">
                      <div className="text-2xl font-bold tracking-tight text-white">첫 글을 남겨 주세요</div>
                      <p className="mt-3 text-sm font-medium text-white/55">
                        짧은 소식이나 의견부터 편하게 시작해도 좋습니다.
                      </p>
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>

          <div className="flex flex-col gap-3 border-t border-white/6 px-4 py-4 md:flex-row md:items-center md:justify-between md:px-5">
            <div className="flex items-center gap-2">
              {hasPrev ? (
                <Link
                  href={buildPageHref(boardFilter, page - 1)}
                  prefetch={false}
                  className="inline-flex min-h-9 items-center justify-center gap-1 rounded-xl border border-white/12 bg-white/[0.04] px-4 text-sm font-semibold text-white/70 transition hover:border-white/24 hover:text-white"
                >
                  <ChevronLeft size={15} />
                  이전
                </Link>
              ) : (
                <span className="inline-flex min-h-9 items-center justify-center gap-1 rounded-xl border border-white/6 px-4 text-sm font-semibold text-white/24 cursor-not-allowed select-none">
                  <ChevronLeft size={15} />
                  이전
                </span>
              )}
              <span className="px-2 text-sm font-bold text-white/46">{page}페이지</span>
              {hasNext ? (
                <Link
                  href={buildPageHref(boardFilter, page + 1)}
                  prefetch={false}
                  className="inline-flex min-h-9 items-center justify-center gap-1 rounded-xl border border-white/12 bg-white/[0.04] px-4 text-sm font-semibold text-white/70 transition hover:border-white/24 hover:text-white"
                >
                  다음
                  <ChevronRight size={15} />
                </Link>
              ) : (
                <span className="inline-flex min-h-9 items-center justify-center gap-1 rounded-xl border border-white/6 px-4 text-sm font-semibold text-white/24 cursor-not-allowed select-none">
                  다음
                  <ChevronRight size={15} />
                </span>
              )}
            </div>
            {renderWriteAction(
              "inline-flex min-h-11 items-center justify-center gap-2 rounded-xl border border-white/12 bg-white/[0.04] px-5 text-sm font-semibold text-white/80 transition hover:border-nzu-green/40 hover:text-nzu-green"
            )}
          </div>
        </section>
      </main>
    </div>
  );
}

export default async function BoardPage() {
  const board = await getCachedBoardPostsWithCommentCounts(20, "all");

  return <BoardPageContent board={board} boardFilter="all" />;
}
