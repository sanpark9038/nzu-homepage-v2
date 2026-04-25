"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { startTransition, useMemo, useState } from "react";

type ComposerState = {
  message: string;
  tone: "idle" | "success" | "error";
};

const initialState: ComposerState = { message: "", tone: "idle" };

const WRITING_GUIDE_LINES = [
  "타 스트리머 및 타인에 대한 비방, 인신공격성 발언은 이용 제한 사유가 될 수 있습니다.",
  "분쟁을 유도하는 게시물, 과도한 도배, 혐오 표현은 제한될 수 있습니다.",
  "외부 링크와 다운로드 자료는 등록 전 한 번 더 확인해 주세요.",
];

export function BoardPostComposer() {
  const router = useRouter();
  const [title, setTitle] = useState("");
  const [content, setContent] = useState("");
  const [imageUrl, setImageUrl] = useState("");
  const [videoUrl, setVideoUrl] = useState("");
  const [downloadUrl, setDownloadUrl] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [state, setState] = useState<ComposerState>(initialState);
  const [showGuide, setShowGuide] = useState(true);

  const shouldHideGuide = useMemo(() => content.trim().length > 0, [content]);

  function hideGuide() {
    if (showGuide) setShowGuide(false);
  }

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setIsSubmitting(true);
    setState(initialState);

    try {
      const response = await fetch("/api/board", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          title,
          content,
          image_url: imageUrl,
          video_url: videoUrl,
          download_url: downloadUrl,
        }),
      });

      const payload = (await response.json().catch(() => ({}))) as {
        ok?: boolean;
        message?: string;
        post?: { id?: string };
      };

      if (!response.ok || !payload.ok) {
        throw new Error(payload.message || "게시글 등록에 실패했습니다.");
      }

      setState({
        tone: "success",
        message: "게시글이 등록되었습니다. 상세 화면으로 이동합니다.",
      });

      const nextHref = payload.post?.id ? `/board/${payload.post.id}` : "/board";
      startTransition(() => {
        router.push(nextHref);
        router.refresh();
      });
    } catch (error) {
      setState({
        tone: "error",
        message: error instanceof Error ? error.message : "게시글 등록에 실패했습니다.",
      });
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <form
      onSubmit={handleSubmit}
      className="space-y-5 rounded-[1.6rem] border border-white/8 bg-[linear-gradient(180deg,rgba(10,16,18,0.98),rgba(7,10,11,0.94))] p-5 shadow-[0_22px_70px_rgba(0,0,0,0.16)]"
    >
      <div className="rounded-[1.2rem] border border-white/8 bg-white/[0.02] px-4 py-3 text-sm font-medium text-white/62">
        일반 글은 말머리 없이 바로 등록됩니다. 공지와 일정은 추후 관리자 작성 경로에서만 사용합니다.
      </div>

      <label className="block space-y-2 text-sm font-bold text-white/72">
        <span>제목</span>
        <input
          value={title}
          onChange={(event) => setTitle(event.target.value)}
          className="w-full rounded-xl border border-white/10 bg-white/[0.03] px-4 py-3 text-sm font-medium text-white outline-none transition focus:border-nzu-green/60 focus:bg-white/[0.05]"
          placeholder="제목을 입력해 주세요"
          maxLength={120}
        />
      </label>

      <div className="space-y-2">
        <div className="flex items-center justify-between">
          <span className="text-sm font-bold text-white/72">내용</span>
          {!showGuide || shouldHideGuide ? (
            <button
              type="button"
              onClick={() => setShowGuide(true)}
              className="text-xs font-black tracking-[0.12em] text-white/42 transition hover:text-nzu-green"
            >
              안내 보기
            </button>
          ) : null}
        </div>

        {showGuide && !shouldHideGuide ? (
          <div className="rounded-[1.2rem] border border-rose-400/20 bg-rose-500/6 px-4 py-4">
            <div className="text-sm font-black text-rose-300">작성 전 안내</div>
            <ul className="mt-3 space-y-2 text-sm font-medium leading-6 text-white/72">
              {WRITING_GUIDE_LINES.map((line) => (
                <li key={line}>- {line}</li>
              ))}
            </ul>
            <div className="mt-3 text-xs font-bold tracking-[0.08em] text-white/38">
              본문 입력칸을 클릭하거나 내용을 쓰기 시작하면 이 안내는 자동으로 접힙니다.
            </div>
          </div>
        ) : null}

        <textarea
          value={content}
          onFocus={hideGuide}
          onClick={hideGuide}
          onChange={(event) => {
            if (showGuide) setShowGuide(false);
            setContent(event.target.value);
          }}
          className="min-h-[320px] w-full rounded-[1.2rem] border border-white/10 bg-white/[0.03] px-4 py-3 text-sm font-medium leading-7 text-white outline-none transition focus:border-nzu-green/60 focus:bg-white/[0.05]"
          placeholder="내용을 입력해 주세요"
          maxLength={4000}
        />
      </div>

      <div className="grid gap-4 md:grid-cols-3">
        <label className="space-y-2 text-sm font-bold text-white/72">
          <span>외부 이미지 URL</span>
          <input
            value={imageUrl}
            onChange={(event) => setImageUrl(event.target.value)}
            className="w-full rounded-xl border border-white/10 bg-white/[0.03] px-4 py-3 text-sm font-medium text-white outline-none transition focus:border-nzu-green/60 focus:bg-white/[0.05]"
            placeholder="https://..."
          />
        </label>
        <label className="space-y-2 text-sm font-bold text-white/72">
          <span>영상 URL</span>
          <input
            value={videoUrl}
            onChange={(event) => setVideoUrl(event.target.value)}
            className="w-full rounded-xl border border-white/10 bg-white/[0.03] px-4 py-3 text-sm font-medium text-white outline-none transition focus:border-nzu-green/60 focus:bg-white/[0.05]"
            placeholder="YouTube 또는 SOOP URL"
          />
        </label>
        <label className="space-y-2 text-sm font-bold text-white/72">
          <span>다운로드 외부 링크</span>
          <input
            value={downloadUrl}
            onChange={(event) => setDownloadUrl(event.target.value)}
            className="w-full rounded-xl border border-white/10 bg-white/[0.03] px-4 py-3 text-sm font-medium text-white outline-none transition focus:border-nzu-green/60 focus:bg-white/[0.05]"
            placeholder="https://..."
          />
        </label>
      </div>

      <div className="rounded-[1.2rem] border border-amber-300/18 bg-amber-300/8 px-4 py-4 text-sm font-medium leading-7 text-amber-100/88">
        직접 업로드는 지원하지 않습니다. 이미지는 외부 URL로 표시하고, 영상은 YouTube 또는 SOOP 링크를 임베드로 연결합니다.
        다운로드 버튼도 외부 링크로만 연결되며, 실제 다운로드 시에는 로그인 게이트가 적용됩니다.
      </div>

      {state.message ? (
        <div
          className={
            state.tone === "success"
              ? "rounded-xl border border-nzu-green/30 bg-nzu-green/10 px-4 py-3 text-sm font-bold text-nzu-green"
              : "rounded-xl border border-rose-400/24 bg-rose-500/10 px-4 py-3 text-sm font-bold text-rose-200"
          }
        >
          {state.message}
        </div>
      ) : null}

      <div className="flex flex-col gap-3 sm:flex-row">
        <button
          type="submit"
          disabled={isSubmitting}
          className="inline-flex min-h-12 items-center justify-center rounded-xl bg-nzu-green px-6 text-sm font-black tracking-tight text-black transition hover:-translate-y-0.5 disabled:translate-y-0 disabled:opacity-60"
        >
          {isSubmitting ? "등록 중..." : "등록"}
        </button>
        <Link
          href="/board"
          className="inline-flex min-h-12 items-center justify-center rounded-xl border border-white/12 bg-white/[0.03] px-6 text-sm font-black tracking-tight text-white/82 transition hover:border-white/22 hover:bg-white/[0.06]"
        >
          게시판으로 돌아가기
        </Link>
      </div>
    </form>
  );
}
