"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";

import type { BoardPostRow } from "@/lib/board";

function formatDate(value: string | null) {
  if (!value) return "-";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "-";
  return new Intl.DateTimeFormat("ko-KR", {
    year: "2-digit",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  }).format(date);
}

function categoryLabel(category: string | null) {
  if (category === "notice") return "공지";
  if (category === "schedule") return "정보/일정";
  return "";
}

export function AdminBoardPostList({ posts }: { posts: BoardPostRow[] }) {
  const router = useRouter();
  const [confirmId, setConfirmId] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [message, setMessage] = useState("");

  async function deletePost(id: string) {
    setConfirmId(null);
    setDeletingId(id);
    setMessage("");
    try {
      const response = await fetch(`/api/board/${encodeURIComponent(id)}`, { method: "DELETE" });
      const payload = (await response.json().catch(() => ({}))) as { ok?: boolean; message?: string };
      if (!response.ok || !payload.ok) {
        setMessage(payload.message || "게시글을 삭제하지 못했습니다.");
        return;
      }
      router.refresh();
    } catch {
      setMessage("네트워크 오류로 삭제하지 못했습니다. 다시 시도해 주세요.");
    } finally {
      setDeletingId(null);
    }
  }

  return (
    <section className="rounded-[1.6rem] border border-white/8 bg-[linear-gradient(180deg,rgba(11,17,19,0.98),rgba(7,9,10,0.96))]">
      {message ? (
        <p className="border-b border-white/6 px-5 py-3 text-sm font-bold text-amber-200">{message}</p>
      ) : null}
      <div className="overflow-x-auto">
        <table className="min-w-full border-collapse text-sm">
          <thead>
            <tr className="border-b border-white/6 bg-white/[0.02] text-left text-xs font-medium tracking-[0.12em] text-white/40">
              <th className="w-[100px] px-4 py-3 md:px-5">말머리</th>
              <th className="px-4 py-3">제목</th>
              <th className="w-[140px] px-4 py-3">글쓴이</th>
              <th className="w-[140px] px-4 py-3">날짜</th>
              <th className="w-[160px] px-4 py-3 text-right md:px-5">관리</th>
            </tr>
          </thead>
          <tbody>
            {posts.length ? (
              posts.map((post) => (
                <tr key={post.id} className="border-b border-white/6 text-white/78 transition hover:bg-white/[0.025]">
                  <td className="px-4 py-3 text-sm font-semibold text-white/50 md:px-5">
                    {categoryLabel(post.category)}
                    {post.published === false ? <span className="ml-1 text-amber-300/80">(비공개)</span> : null}
                  </td>
                  <td className="max-w-[420px] px-4 py-3">
                    <Link
                      href={`/board/${post.id}`}
                      prefetch={false}
                      target="_blank"
                      className="block truncate font-semibold text-white transition hover:text-nzu-green"
                    >
                      {post.title}
                    </Link>
                  </td>
                  <td className="px-4 py-3 text-sm text-white/60">{post.author_name}</td>
                  <td className="px-4 py-3 text-sm tabular-nums text-white/54">{formatDate(post.created_at)}</td>
                  <td className="px-4 py-3 text-right md:px-5">
                    {confirmId === post.id ? (
                      <span className="inline-flex items-center gap-2">
                        <button
                          type="button"
                          onClick={() => setConfirmId(null)}
                          className="rounded-lg border border-white/16 bg-white/[0.03] px-3 py-1 text-xs font-bold text-white/66 transition hover:border-white/28 hover:text-white"
                        >
                          취소
                        </button>
                        <button
                          type="button"
                          onClick={() => deletePost(post.id)}
                          disabled={deletingId === post.id}
                          className="rounded-lg border border-rose-400/30 bg-rose-400/10 px-3 py-1 text-xs font-bold text-rose-300 transition hover:bg-rose-400/20 disabled:opacity-50"
                        >
                          {deletingId === post.id ? "삭제 중..." : "삭제 확정"}
                        </button>
                      </span>
                    ) : (
                      <button
                        type="button"
                        onClick={() => setConfirmId(post.id)}
                        disabled={deletingId === post.id}
                        className="rounded-lg border border-white/16 bg-white/[0.03] px-3 py-1 text-xs font-bold text-white/66 transition hover:border-rose-400/40 hover:text-rose-300 disabled:opacity-50"
                      >
                        삭제
                      </button>
                    )}
                  </td>
                </tr>
              ))
            ) : (
              <tr>
                <td colSpan={5} className="px-4 py-12 text-center text-sm font-medium text-white/55">
                  게시글이 없습니다.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </section>
  );
}
