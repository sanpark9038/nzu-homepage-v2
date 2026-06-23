import Link from "next/link";
import { cookies } from "next/headers";

import { BoardPostComposer } from "@/components/board/BoardPostComposer";
import { parsePublicAuthSessionCookieValue, PUBLIC_AUTH_SESSION_COOKIE } from "@/lib/public-auth";

export default async function BoardWritePage() {
  const cookieStore = await cookies();
  const session = parsePublicAuthSessionCookieValue(cookieStore.get(PUBLIC_AUTH_SESSION_COOKIE)?.value);

  return (
    <div className="min-h-screen bg-background text-foreground">
      <main className="mx-auto flex w-full max-w-5xl flex-col gap-5 px-4 py-8 md:px-8">
        <section className="hosaga-card p-5">
          <div className="flex flex-col gap-5 md:flex-row md:items-end md:justify-between">
            <div>
              <div className="ui-label uppercase text-nzu-green">Write</div>
              <h1 className="mt-3 text-4xl font-bold tracking-tight text-white">글쓰기</h1>
              <p className="mt-2 max-w-3xl text-sm font-medium leading-7 text-white/58">
                제목과 내용을 적으면 바로 등록됩니다. 필요한 경우 이미지나 영상 링크만 함께 넣어 주세요.
              </p>
              {session ? <p className="mt-3 text-sm font-medium text-nzu-green">{session.displayName} · SOOP</p> : null}
            </div>
            <Link
              href="/board"
              className="inline-flex min-h-12 items-center justify-center rounded-xl border border-white/12 bg-white/[0.04] px-5 text-sm font-semibold text-white/75 transition hover:border-white/22 hover:bg-white/[0.06]"
            >
              게시판으로 돌아가기
            </Link>
          </div>
        </section>

        {session ? (
          <BoardPostComposer />
        ) : (
          <section className="hosaga-card p-6">
            <div className="ui-label uppercase text-nzu-green">Login</div>
            <h2 className="mt-3 text-2xl font-bold tracking-tight text-white">
              글쓰기는 SOOP 로그인 후 사용할 수 있습니다
            </h2>
            <p className="mt-3 max-w-2xl text-sm font-medium leading-7 text-white/58">
              로그인하면 바로 이 화면으로 돌아와 글을 쓸 수 있습니다.
            </p>
            <div className="mt-5 flex flex-col gap-3 sm:flex-row">
              <a
                href="/api/auth/soop/start?next=/board/write"
                className="inline-flex min-h-12 items-center justify-center rounded-xl bg-nzu-green px-6 text-sm font-bold text-black transition hover:-translate-y-0.5"
              >
                SOOP 로그인하기
              </a>
              <Link
                href="/board"
                className="inline-flex min-h-12 items-center justify-center rounded-xl border border-white/12 bg-white/[0.03] px-6 text-sm font-semibold text-white/75 transition hover:border-white/22 hover:bg-white/[0.06]"
              >
                게시판으로 돌아가기
              </Link>
            </div>
          </section>
        )}
      </main>
    </div>
  );
}
