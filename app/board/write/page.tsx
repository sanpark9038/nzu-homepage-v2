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
        <section className="rounded-[1.4rem] border border-white/8 bg-[linear-gradient(180deg,rgba(10,16,18,0.98),rgba(7,10,11,0.94))] p-5 shadow-[0_18px_54px_rgba(0,0,0,0.18)]">
          <div className="flex flex-col gap-5 md:flex-row md:items-end md:justify-between">
            <div>
              <div className="text-[11px] font-black uppercase tracking-[0.24em] text-nzu-green">Write</div>
              <h1 className="mt-3 text-4xl font-black tracking-[-0.05em] text-white">글쓰기</h1>
              <p className="mt-2 max-w-3xl text-sm font-medium leading-7 text-white/58">
                제목과 내용을 적으면 바로 등록됩니다. 필요한 경우 이미지나 영상 링크만 함께 넣어 주세요.
              </p>
              {session ? <p className="mt-3 text-sm font-bold text-nzu-green">{session.displayName} · SOOP</p> : null}
            </div>
            <Link
              href="/board"
              className="inline-flex min-h-12 items-center justify-center rounded-xl border border-white/12 bg-white/[0.04] px-5 text-sm font-black text-white transition hover:border-white/22 hover:bg-white/[0.06]"
            >
              게시판으로 돌아가기
            </Link>
          </div>
        </section>

        {session ? (
          <BoardPostComposer />
        ) : (
          <section className="rounded-[1.6rem] border border-white/8 bg-[linear-gradient(180deg,rgba(10,16,18,0.98),rgba(7,10,11,0.94))] p-6 shadow-[0_22px_70px_rgba(0,0,0,0.16)]">
            <div className="text-[11px] font-black uppercase tracking-[0.24em] text-nzu-green">Login</div>
            <h2 className="mt-3 text-2xl font-black tracking-tight text-white">
              글쓰기는 SOOP 로그인 후 사용할 수 있습니다
            </h2>
            <p className="mt-3 max-w-2xl text-sm font-medium leading-7 text-white/62">
              로그인하면 바로 이 화면으로 돌아와 글을 쓸 수 있습니다.
            </p>
            <div className="mt-5 flex flex-col gap-3 sm:flex-row">
              <a
                href="/api/auth/soop/start?next=/board/write"
                className="inline-flex min-h-12 items-center justify-center rounded-xl bg-nzu-green px-6 text-sm font-black text-black transition hover:-translate-y-0.5"
              >
                SOOP 로그인하기
              </a>
              <Link
                href="/board"
                className="inline-flex min-h-12 items-center justify-center rounded-xl border border-white/12 bg-white/[0.03] px-6 text-sm font-black text-white/82 transition hover:border-white/22 hover:bg-white/[0.06]"
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
