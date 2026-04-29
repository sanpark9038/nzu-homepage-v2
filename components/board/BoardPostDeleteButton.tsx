"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { Trash2 } from "lucide-react";

export function BoardPostDeleteButton({ postId }: { postId: string }) {
  const router = useRouter();
  const [isDeleting, setIsDeleting] = useState(false);
  const [message, setMessage] = useState("");

  async function deletePost() {
    if (isDeleting) return;
    if (!window.confirm("이 게시글을 삭제할까요?")) return;

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

  return (
    <div className="flex flex-col items-start gap-2">
      <button
        type="button"
        onClick={deletePost}
        disabled={isDeleting}
        className="inline-flex min-h-11 items-center justify-center gap-2 rounded-xl border border-rose-300/24 bg-rose-500/10 px-5 text-sm font-black text-rose-100 transition hover:border-rose-300/45 hover:bg-rose-500/16 disabled:opacity-60"
      >
        <Trash2 size={16} />
        {isDeleting ? "삭제 중..." : "삭제"}
      </button>
      {message ? <p className="text-xs font-bold text-rose-200">{message}</p> : null}
    </div>
  );
}
