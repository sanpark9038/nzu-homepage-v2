"use client";

import { useRouter } from "next/navigation";
import { useMemo, useState, useTransition } from "react";

import type { BoardCommentRow } from "@/lib/board-comments";
import type { PublicAuthSession } from "@/lib/public-auth";

type BoardCommentsProps = {
  postId: string;
  initialComments: BoardCommentRow[];
  storageReady: boolean;
  session: PublicAuthSession | null;
  currentAuthorId: string | null;
  isAdmin: boolean;
};

function formatCommentDate(value: string) {
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

function canDeleteComment(comment: BoardCommentRow, currentAuthorId: string | null, isAdmin: boolean) {
  return isAdmin || Boolean(currentAuthorId && comment.author_id === currentAuthorId);
}

export function BoardComments({
  postId,
  initialComments,
  storageReady,
  session,
  currentAuthorId,
  isAdmin,
}: BoardCommentsProps) {
  const router = useRouter();
  const [comments, setComments] = useState(initialComments);
  const [content, setContent] = useState("");
  const [message, setMessage] = useState("");
  const [isPending, startTransition] = useTransition();
  const remaining = 300 - content.length;
  const commentCountLabel = useMemo(() => `댓글 ${comments.length}`, [comments.length]);

  if (!storageReady) {
    return (
      <section className="rounded-[1.6rem] border border-white/8 bg-[linear-gradient(180deg,rgba(10,16,18,0.98),rgba(7,10,11,0.94))] p-5 shadow-[0_22px_70px_rgba(0,0,0,0.16)]">
        <h2 className="text-sm font-black text-white">댓글</h2>
        <p className="mt-3 text-sm font-medium text-white/58">댓글 기능을 준비 중입니다.</p>
      </section>
    );
  }

  async function submitComment(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setMessage("");
    const nextContent = content.trim();
    if (!nextContent) {
      setMessage("댓글 내용을 입력해 주세요.");
      return;
    }

    const response = await fetch(`/api/board/${encodeURIComponent(postId)}/comments`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ content: nextContent }),
    });
    const payload = (await response.json().catch(() => ({}))) as {
      ok?: boolean;
      message?: string;
      comment?: BoardCommentRow;
    };

    if (!response.ok || !payload.ok || !payload.comment) {
      setMessage(payload.message || "댓글을 등록하지 못했습니다. 잠시 후 다시 시도해 주세요.");
      return;
    }

    setComments((current) => [...current, payload.comment as BoardCommentRow]);
    setContent("");
    startTransition(() => router.refresh());
  }

  async function deleteComment(commentId: string) {
    if (!window.confirm("댓글을 삭제할까요?")) return;
    setMessage("");
    const response = await fetch(
      `/api/board/${encodeURIComponent(postId)}/comments/${encodeURIComponent(commentId)}`,
      { method: "DELETE" }
    );
    const payload = (await response.json().catch(() => ({}))) as { ok?: boolean; message?: string };
    if (!response.ok || !payload.ok) {
      setMessage(payload.message || "댓글을 삭제하지 못했습니다.");
      return;
    }
    setComments((current) => current.filter((comment) => comment.id !== commentId));
    startTransition(() => router.refresh());
  }

  return (
    <section className="rounded-[1.6rem] border border-white/8 bg-[linear-gradient(180deg,rgba(10,16,18,0.98),rgba(7,10,11,0.94))] p-5 shadow-[0_22px_70px_rgba(0,0,0,0.16)]">
      <div className="flex items-center justify-between gap-3">
        <h2 className="text-sm font-black text-white">댓글</h2>
        <span className="text-xs font-bold text-white/42">{commentCountLabel}</span>
      </div>

      <div className="mt-4 divide-y divide-white/8">
        {comments.length ? (
          comments.map((comment) => (
            <div key={comment.id} className="py-4">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="flex flex-wrap items-center gap-2 text-xs font-bold text-white/46">
                  <span className="text-white/78">{comment.author_name}</span>
                  <span>{formatCommentDate(comment.created_at)}</span>
                </div>
                {canDeleteComment(comment, currentAuthorId, isAdmin) ? (
                  <button
                    type="button"
                    onClick={() => deleteComment(comment.id)}
                    disabled={isPending}
                    className="rounded-lg border border-white/10 px-3 py-1 text-xs font-bold text-white/58 transition hover:border-white/22 hover:text-white"
                  >
                    삭제
                  </button>
                ) : null}
              </div>
              <p className="mt-2 whitespace-pre-wrap text-sm font-medium leading-7 text-white/76">{comment.content}</p>
            </div>
          ))
        ) : (
          <p className="rounded-[1.1rem] border border-dashed border-white/10 bg-white/[0.02] px-4 py-8 text-center text-sm font-medium text-white/50">
            아직 댓글이 없습니다.
          </p>
        )}
      </div>

      <div className="mt-5 border-t border-white/8 pt-4">
        {session ? (
          <form onSubmit={submitComment} className="space-y-3">
            <textarea
              value={content}
              onChange={(event) => setContent(event.target.value.slice(0, 300))}
              maxLength={300}
              rows={3}
              className="w-full resize-none rounded-xl border border-white/10 bg-black/20 px-4 py-3 text-sm font-medium text-white outline-none transition placeholder:text-white/28 focus:border-nzu-green/50"
              placeholder="댓글을 입력하세요."
            />
            <div className="flex flex-wrap items-center justify-between gap-3">
              <span className="text-xs font-bold text-white/38">{content.length}/300</span>
              <button
                type="submit"
                disabled={isPending || !content.trim() || remaining < 0}
                className="inline-flex min-h-10 items-center justify-center rounded-xl bg-nzu-green px-4 text-sm font-black text-black transition hover:-translate-y-0.5 disabled:cursor-not-allowed disabled:opacity-45"
              >
                등록
              </button>
            </div>
          </form>
        ) : (
          <p className="text-sm font-medium text-white/58">SOOP 로그인 후 댓글을 작성할 수 있습니다.</p>
        )}
        {message ? <p className="mt-3 text-sm font-bold text-amber-200">{message}</p> : null}
      </div>
    </section>
  );
}
