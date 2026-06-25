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

  const diffMs = Date.now() - date.getTime();
  const diffMin = Math.floor(diffMs / 60_000);
  const diffHr = Math.floor(diffMs / 3_600_000);
  const diffDay = Math.floor(diffMs / 86_400_000);

  if (diffMin < 1) return "방금 전";
  if (diffMin < 60) return `${diffMin}분 전`;
  if (diffHr < 24) return `${diffHr}시간 전`;
  if (diffDay === 1) return "어제";
  if (diffDay < 7) return `${diffDay}일 전`;

  return new Intl.DateTimeFormat("ko-KR", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
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
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);
  const [, startTransition] = useTransition();
  const remaining = 300 - content.length;
  const commentCountLabel = useMemo(() => `댓글 ${comments.length}`, [comments.length]);

  if (!storageReady) {
    return (
      <section className="rounded-[1.6rem] border border-white/12 bg-[linear-gradient(180deg,rgba(13,21,23,0.98),rgba(8,13,14,0.96))] p-5 shadow-[0_22px_70px_rgba(0,0,0,0.18)]">
        <h2 className="border-b border-white/12 pb-4 text-base font-semibold text-white">댓글</h2>
        <p className="mt-4 text-sm font-medium text-white/66">댓글 기능을 준비 중입니다.</p>
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

    setIsSubmitting(true);
    try {
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
    } finally {
      setIsSubmitting(false);
    }
  }

  async function deleteComment(commentId: string) {
    setConfirmDeleteId(null);
    setDeletingId(commentId);
    setMessage("");
    try {
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
    } finally {
      setDeletingId(null);
    }
  }

  return (
    <section className="rounded-[1.6rem] border border-white/12 bg-[linear-gradient(180deg,rgba(13,21,23,0.98),rgba(8,13,14,0.96))] p-5 shadow-[0_22px_70px_rgba(0,0,0,0.18)]">
      <div className="flex items-center justify-between gap-3 border-b border-white/12 pb-4">
        <h2 className="text-base font-semibold text-white">댓글</h2>
        <span className="text-sm font-bold text-white/58">{commentCountLabel}</span>
      </div>

      <div className="divide-y divide-white/10">
        {comments.length ? (
          comments.map((comment) => (
            <div key={comment.id} className="py-5">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="flex flex-wrap items-center gap-2 text-sm font-bold text-white/56">
                  <span className="text-white/86">{comment.author_name}</span>
                  <span>{formatCommentDate(comment.created_at)}</span>
                </div>
                {canDeleteComment(comment, currentAuthorId, isAdmin) ? (
                  confirmDeleteId === comment.id ? (
                    <div className="flex items-center gap-2">
                      <span className="text-xs font-bold text-white/60">삭제할까요?</span>
                      <button
                        type="button"
                        onClick={() => setConfirmDeleteId(null)}
                        className="rounded-lg border border-white/16 bg-white/[0.03] px-3 py-1 text-xs font-bold text-white/66 transition hover:border-white/28 hover:text-white"
                      >
                        취소
                      </button>
                      <button
                        type="button"
                        onClick={() => deleteComment(comment.id)}
                        disabled={deletingId === comment.id}
                        className="rounded-lg border border-rose-400/30 bg-rose-400/10 px-3 py-1 text-xs font-bold text-rose-300 transition hover:bg-rose-400/20 disabled:opacity-50"
                      >
                        {deletingId === comment.id ? "삭제 중..." : "삭제"}
                      </button>
                    </div>
                  ) : (
                    <button
                      type="button"
                      onClick={() => setConfirmDeleteId(comment.id)}
                      disabled={deletingId === comment.id}
                      className="rounded-lg border border-white/16 bg-white/[0.03] px-3 py-1 text-xs font-bold text-white/66 transition hover:border-white/28 hover:text-white disabled:opacity-50"
                    >
                      삭제
                    </button>
                  )
                ) : null}
              </div>
              <p className="mt-3 whitespace-pre-wrap text-[15px] font-medium leading-7 text-white/84">{comment.content}</p>
            </div>
          ))
        ) : (
          <p className="mt-5 rounded-[1.1rem] border border-dashed border-white/14 bg-white/[0.03] px-4 py-8 text-center text-sm font-medium text-white/58">
            아직 댓글이 없습니다.
          </p>
        )}
      </div>

      <div className="mt-5 border-t border-white/12 pt-5">
        {session ? (
          <form onSubmit={submitComment} className="space-y-3">
            <textarea
              value={content}
              onChange={(event) => setContent(event.target.value.slice(0, 300))}
              maxLength={300}
              rows={3}
              disabled={isSubmitting}
              className="w-full resize-none rounded-xl border border-white/16 bg-black/28 px-4 py-3 text-[15px] font-medium leading-7 text-white outline-none transition placeholder:text-white/36 focus:border-nzu-green/60 focus:bg-black/36 disabled:opacity-60"
              placeholder="댓글을 입력하세요."
            />
            <div className="flex flex-wrap items-center justify-between gap-3">
              <span className="text-xs font-bold text-white/52">{content.length}/300</span>
              <button
                type="submit"
                disabled={isSubmitting || !content.trim() || remaining < 0}
                className="inline-flex min-h-10 items-center justify-center rounded-xl bg-nzu-green px-5 text-sm font-bold text-black transition hover:-translate-y-0.5 disabled:cursor-not-allowed disabled:opacity-45"
              >
                {isSubmitting ? "등록 중..." : "등록"}
              </button>
            </div>
          </form>
        ) : (
          <p className="text-sm font-medium text-white/66">SOOP 로그인 후 댓글을 작성할 수 있습니다.</p>
        )}
        {message ? <p className="mt-3 text-sm font-bold text-amber-200">{message}</p> : null}
      </div>
    </section>
  );
}
