"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { Trash2 } from "lucide-react";

export function BoardPostDeleteButton({ postId }: { postId: string }) {
  const router = useRouter();
  const [isDeleting, setIsDeleting] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const [message, setMessage] = useState("");

  async function deletePost() {
    if (isDeleting) return;
    setConfirming(false);
    setIsDeleting(true);
    setMessage("");

    try {
      const response = await fetch(`/api/board/${encodeURIComponent(postId)}`, {
        method: "DELETE",
      });
      const payload = (await response.json().catch(() => ({}))) as { ok?: boolean; message?: string };

      if (!response.ok || !payload.ok) {
        throw new Error(payload.message || "게시글을 삭제하지 못했습니다.");
      }

      router.replace("/board");
      router.refresh();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "게시글을 삭제하지 못했습니다.");
      setIsDeleting(false);
    }
  }

  if (confirming) {
    return (
      <div className="flex items-center gap-2">
        <span className="text-xs font-bold text-white/60">삭제할까요?</span>
        <button
          type="button"
          onClick={() => setConfirming(false)}
          className="inline-flex min-h-9 items-center justify-center rounded-xl border border-white/16 bg-white/[0.03] px-3 text-sm font-semibold text-white/70 transition hover:border-white/28 hover:text-white"
        >
          취소
        </button>
        <button
          type="button"
          onClick={deletePost}
          disabled={isDeleting}
          className="inline-flex min-h-9 items-center justify-center gap-1.5 rounded-xl border border-rose-400/30 bg-rose-400/10 px-3 text-sm font-semibold text-rose-300 transition hover:bg-rose-400/20 disabled:opacity-50"
        >
          <Trash2 size={14} />
          {isDeleting ? "삭제 중..." : "삭제"}
        </button>
        {message ? <p className="text-xs font-bold text-rose-200">{message}</p> : null}
      </div>
    );
  }

  return (
    <button
      type="button"
      onClick={() => setConfirming(true)}
      disabled={isDeleting}
      className="inline-flex min-h-9 items-center justify-center gap-1.5 rounded-xl border border-rose-300/24 bg-rose-500/10 px-4 text-sm font-semibold text-rose-100 transition hover:border-rose-300/45 hover:bg-rose-500/16 disabled:opacity-60"
    >
      <Trash2 size={14} />
      삭제
    </button>
  );
}
