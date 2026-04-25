import Link from "next/link";
import { cookies } from "next/headers";
import { ImageIcon, PlayCircle, SquarePen } from "lucide-react";

import {
  getBoardCategoryLabel,
  getBoardCategoryTone,
  hasBoardMedia,
  listBoardPosts,
} from "@/lib/board";
import {
  parsePublicAuthSessionCookieValue,
  PUBLIC_AUTH_SESSION_COOKIE,
} from "@/lib/public-auth";

export const runtime = "nodejs";
export const revalidate = 0;

function formatBoardListDate(value: string | null) {
  if (!value) return "-";

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "-";

  const now = new Date();
  const sameDay =
    date.getFullYear() === now.getFullYear() &&
    date.getMonth() === now.getMonth() &&
    date.getDate() === now.getDate();

  return new Intl.DateTimeFormat("ko-KR", sameDay
    ? { hour: "2-digit", minute: "2-digit" }
    : { year: "2-digit", month: "2-digit", day: "2-digit" }).format(date);
}

function renderWriteAction(_isLoggedIn: boolean, className: string) {
  return (
    <Link href="/board/write" className={className}>
      <SquarePen size={16} />
      <span>글쓰기</span>
    </Link>
  );
}

export default async function BoardPage({
  searchParams,
}: {
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
}) {
  const cookieStore = await cookies();
  const board = await listBoardPosts();
  const session = parsePublicAuthSessionCookieValue(cookieStore.get(PUBLIC_AUTH_SESSION_COOKIE)?.value);
  const params = ((await searchParams) || {}) as Record<string, string | string[] | undefined>;
  const loginStatus = typeof params.login === "string" ? params.login : "";
  const downloadStatus = typeof params.download === "string" ? params.download : "";

  return (
    <div className="min-h-screen bg-background text-foreground">
      <main className="mx-auto flex w-full max-w-6xl flex-col gap-5 px-4 py-8 md:px-8">
        <section className="rounded-[1.4rem] border border-white/8 bg-[linear-gradient(180deg,rgba(10,16,18,0.98),rgba(7,10,11,0.94))] p-5 shadow-[0_18px_54px_rgba(0,0,0,0.18)]">
          <div className="flex flex-col gap-5 md:flex-row md:items-end md:justify-between">
            <div>
              <div className="text-[11px] font-black uppercase tracking-[0.24em] text-nzu-green">Board</div>
              <h1 className="mt-3 text-4xl font-black tracking-[-0.05em] text-white">전체글</h1>
              <p className="mt-2 max-w-3xl text-sm font-medium leading-7 text-white/58">
                새 글과 소식을 한눈에 확인하세요. 글쓰기는 SOOP 로그인 후 사용할 수 있습니다.
              </p>
            </div>
            {renderWriteAction(
              Boolean(session),
              "inline-flex min-h-12 items-center justify-center gap-2 rounded-xl bg-nzu-green px-5 text-sm font-black text-black transition hover:-translate-y-0.5"
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
            <div className="flex items-center gap-2 text-sm font-black">
              <span className="rounded-lg bg-nzu-green/10 px-3 py-2 text-nzu-green">전체글</span>
              <span className="rounded-lg bg-white/[0.03] px-3 py-2 text-white/42">공지/일정</span>
            </div>
          </div>

          <div className="overflow-x-auto">
            <table className="min-w-full border-collapse text-sm">
              <thead>
                <tr className="border-b border-white/6 bg-white/[0.02] text-left text-xs font-black tracking-[0.14em] text-white/46">
                  <th className="w-[110px] px-4 py-3 md:px-5">말머리</th>
                  <th className="min-w-[420px] px-4 py-3">제목</th>
                  <th className="w-[160px] px-4 py-3">글쓴이</th>
                  <th className="w-[140px] px-4 py-3">날짜</th>
                  <th className="w-[90px] px-4 py-3 text-right">조회</th>
                  <th className="w-[90px] px-4 py-3 text-right md:px-5">추천</th>
                </tr>
              </thead>
              <tbody>
                {board.posts.length ? (
                  board.posts.map((post) => {
                    const { hasImage, hasVideo } = hasBoardMedia(post);
                    const categoryLabel = getBoardCategoryLabel(post.category);
                    const categoryTone = getBoardCategoryTone(post.category);

                    return (
                      <tr key={post.id} className="border-b border-white/6 text-white/78 transition hover:bg-white/[0.025]">
                        <td className={`px-4 py-3 text-sm font-black md:px-5 ${categoryTone}`}>
                          {categoryLabel || <span aria-hidden="true">&nbsp;</span>}
                        </td>
                        <td className="px-4 py-3">
                          <Link
                            href={`/board/${post.id}`}
                            className="inline-flex max-w-full items-center gap-2 font-bold tracking-tight text-white transition hover:text-nzu-green"
                          >
                            <span className="truncate">{post.title}</span>
                            {hasImage ? <ImageIcon size={14} className="shrink-0 text-white/45" /> : null}
                            {hasVideo ? <PlayCircle size={14} className="shrink-0 text-white/45" /> : null}
                          </Link>
                        </td>
                        <td className="px-4 py-3 text-sm font-semibold text-white/68">{post.author_name}</td>
                        <td className="px-4 py-3 text-sm text-white/54">{formatBoardListDate(post.created_at)}</td>
                        <td className="px-4 py-3 text-right text-sm text-white/46">-</td>
                        <td className="px-4 py-3 text-right text-sm text-white/46 md:px-5">-</td>
                      </tr>
                    );
                  })
                ) : (
                  <tr>
                    <td colSpan={6} className="px-4 py-16 text-center md:px-5">
                      <div className="text-2xl font-black tracking-tight text-white">첫 글을 남겨 주세요</div>
                      <p className="mt-3 text-sm font-medium text-white/55">
                        짧은 소식이나 의견부터 편하게 시작해도 좋습니다.
                      </p>
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>

          <div className="flex flex-col gap-3 border-t border-white/6 px-4 py-4 md:flex-row md:items-center md:justify-end md:px-5">
            {renderWriteAction(
              Boolean(session),
              "inline-flex min-h-11 items-center justify-center gap-2 rounded-xl border border-white/12 bg-white/[0.04] px-5 text-sm font-black text-white transition hover:border-nzu-green/40 hover:text-nzu-green"
            )}
          </div>
        </section>
      </main>
    </div>
  );
}
