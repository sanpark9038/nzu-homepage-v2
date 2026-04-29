"use client";

import Link from "next/link";
import Image from "next/image";
import { useRouter } from "next/navigation";
import { startTransition, useRef, useState } from "react";

type ComposerState = {
  message: string;
  tone: "idle" | "success" | "error";
};

type ImageUploadState = {
  message: string;
  tone: "idle" | "success" | "error";
};

const initialState: ComposerState = { message: "", tone: "idle" };
const initialImageUploadState: ImageUploadState = { message: "", tone: "idle" };

const BOARD_IMAGE_ACCEPT = "image/jpeg,image/png,image/gif,image/webp";
const BOARD_IMAGE_MAX_BYTES = 5 * 1024 * 1024;

const WRITING_GUIDE_LINES = [
  "타 스트리머와 이용자를 향한 비방, 인신공격성 표현은 삼가 주세요.",
  "분쟁을 부르는 글이나 과도한 도배성 글은 제한될 수 있습니다.",
  "이미지는 선택하거나 붙여넣기(Ctrl+V)로 바로 올릴 수 있어요.",
];

function isPreviewableImageUrl(value: string) {
  const text = value.trim();
  if (!text) return false;

  try {
    const url = new URL(text);
    return url.protocol === "https:" || url.protocol === "http:";
  } catch {
    return false;
  }
}

export function BoardPostComposer() {
  const router = useRouter();
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const activeImageUploadIdRef = useRef(0);
  const [title, setTitle] = useState("");
  const [content, setContent] = useState("");
  const [imageUrl, setImageUrl] = useState("");
  const [videoUrl, setVideoUrl] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isUploadingImage, setIsUploadingImage] = useState(false);
  const [state, setState] = useState<ComposerState>(initialState);
  const [imageUploadState, setImageUploadState] = useState<ImageUploadState>(initialImageUploadState);
  const [showGuide, setShowGuide] = useState(true);

  const contentHasText = content.trim().length > 0;
  const shouldShowGuide = showGuide && !contentHasText;
  const shouldPreviewImage = isPreviewableImageUrl(imageUrl);

  function hideGuide() {
    if (showGuide) setShowGuide(false);
  }

  function focusContentFromGuide(event: React.PointerEvent<HTMLDivElement>) {
    event.preventDefault();
    hideGuide();
    requestAnimationFrame(() => textareaRef.current?.focus());
  }

  function validateImageFile(file: File) {
    if (!BOARD_IMAGE_ACCEPT.split(",").includes(file.type)) {
      return "jpg, png, gif, webp 이미지만 올릴 수 있어요.";
    }

    if (file.size > BOARD_IMAGE_MAX_BYTES) {
      return "이미지는 5MB 이하로 올려 주세요.";
    }

    return null;
  }

  async function uploadImageFile(file: File) {
    const validationMessage = validateImageFile(file);
    if (validationMessage) {
      setImageUploadState({ tone: "error", message: validationMessage });
      return;
    }

    const uploadId = activeImageUploadIdRef.current + 1;
    activeImageUploadIdRef.current = uploadId;
    setIsUploadingImage(true);
    setImageUploadState({ tone: "idle", message: "이미지를 올리는 중입니다..." });

    try {
      const formData = new FormData();
      formData.append("file", file);

      const response = await fetch("/api/board/images", {
        method: "POST",
        body: formData,
      });

      const payload = (await response.json().catch(() => ({}))) as {
        ok?: boolean;
        message?: string;
        image?: { url?: string };
      };

      if (!response.ok || !payload.ok || !payload.image?.url) {
        throw new Error(payload.message || "이미지를 업로드하지 못했습니다.");
      }

      if (activeImageUploadIdRef.current === uploadId) {
        setImageUrl(payload.image.url);
        setImageUploadState({ tone: "success", message: "이미지가 추가되었습니다." });
      }
    } catch (error) {
      if (activeImageUploadIdRef.current === uploadId) {
        setImageUploadState({
          tone: "error",
          message: error instanceof Error ? error.message : "이미지를 업로드하지 못했습니다.",
        });
      }
    } finally {
      if (activeImageUploadIdRef.current === uploadId) {
        setIsUploadingImage(false);
      }
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  }

  function handleContentPaste(event: React.ClipboardEvent<HTMLTextAreaElement>) {
    const imageFile = Array.from(event.clipboardData.files).find((file) => file.type.startsWith("image/"));
    if (!imageFile) return;

    event.preventDefault();
    hideGuide();
    void uploadImageFile(imageFile);
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
        }),
      });

      const payload = (await response.json().catch(() => ({}))) as {
        ok?: boolean;
        message?: string;
        post?: { id?: string };
      };

      if (!response.ok || !payload.ok) {
        throw new Error(payload.message || "게시글을 등록하지 못했습니다.");
      }

      setState({
        tone: "success",
        message: "게시글이 등록되었습니다. 게시글로 이동합니다.",
      });

      const nextHref = payload.post?.id ? `/board/${payload.post.id}` : "/board";
      startTransition(() => {
        router.push(nextHref);
        router.refresh();
      });
    } catch (error) {
      setState({
        tone: "error",
        message: error instanceof Error ? error.message : "게시글을 등록하지 못했습니다.",
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
        일반 글은 말머리 없이 등록됩니다. 제목과 본문만으로도 바로 글을 쓸 수 있어요.
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
          <label htmlFor="board-post-content" className="text-sm font-bold text-white/72">
            내용
          </label>
          {!shouldShowGuide && !contentHasText ? (
            <button
              type="button"
              onClick={() => setShowGuide(true)}
              className="text-xs font-black tracking-[0.12em] text-white/42 transition hover:text-nzu-green"
            >
              안내 보기
            </button>
          ) : null}
        </div>

        <div className="relative">
          {shouldShowGuide ? (
            <div
              id="board-content-guide"
              data-content-guide="true"
              className="absolute inset-0 z-10 cursor-text rounded-[1.2rem] border border-rose-400/20 bg-rose-500/6 px-4 py-3 text-sm font-medium leading-7 text-white/70"
              onPointerDown={focusContentFromGuide}
            >
              <div className="max-w-3xl">
                <div className="font-black text-rose-200">편하게 적어 주세요.</div>
                <ul className="mt-3 space-y-1.5">
                  {WRITING_GUIDE_LINES.map((line) => (
                    <li key={line}>- {line}</li>
                  ))}
                </ul>
              </div>
            </div>
          ) : null}

          <textarea
            id="board-post-content"
            ref={textareaRef}
            value={content}
            onFocus={hideGuide}
            onClick={hideGuide}
            onPaste={handleContentPaste}
            onChange={(event) => {
              if (showGuide) setShowGuide(false);
              setContent(event.target.value);
            }}
            aria-describedby={shouldShowGuide ? "board-content-guide" : undefined}
            className="min-h-[320px] w-full rounded-[1.2rem] border border-white/10 bg-white/[0.03] px-4 py-3 text-sm font-medium leading-7 text-white outline-none transition focus:border-nzu-green/60 focus:bg-white/[0.05]"
            placeholder={shouldShowGuide ? "" : "내용을 입력해 주세요"}
            maxLength={4000}
          />
        </div>
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        <div className="space-y-2 text-sm font-bold text-white/72">
          <div className="flex min-h-9 items-center justify-between gap-3">
            <span>이미지</span>
            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              disabled={isUploadingImage}
              className="inline-flex min-h-9 items-center justify-center rounded-lg border border-white/12 bg-white/[0.04] px-3 text-xs font-black text-white/82 transition hover:border-white/22 hover:bg-white/[0.07] disabled:opacity-50"
            >
              {isUploadingImage ? "업로드 중..." : "이미지 선택"}
            </button>
          </div>
          <input
            ref={fileInputRef}
            type="file"
            accept="image/jpeg,image/png,image/gif,image/webp"
            className="hidden"
            onChange={(event) => {
              const file = event.target.files?.[0];
              if (file) void uploadImageFile(file);
            }}
          />
          <input
            value={imageUrl}
            aria-label="이미지 URL"
            onChange={(event) => {
              setImageUrl(event.target.value);
              setImageUploadState(initialImageUploadState);
            }}
            className="w-full rounded-xl border border-white/10 bg-white/[0.03] px-4 py-3 text-sm font-medium text-white outline-none transition focus:border-nzu-green/60 focus:bg-white/[0.05]"
            placeholder="이미지 URL 또는 직접 업로드"
          />
          {imageUploadState.message ? (
            <p
              className={
                imageUploadState.tone === "error"
                  ? "text-xs font-bold text-rose-200"
                  : imageUploadState.tone === "success"
                    ? "text-xs font-bold text-nzu-green"
                    : "text-xs font-bold text-white/46"
              }
            >
              {imageUploadState.message}
            </p>
          ) : null}
        </div>

        <label className="space-y-2 text-sm font-bold text-white/72">
          <span className="flex min-h-9 items-center">영상 URL</span>
          <input
            value={videoUrl}
            onChange={(event) => setVideoUrl(event.target.value)}
            className="w-full rounded-xl border border-white/10 bg-white/[0.03] px-4 py-3 text-sm font-medium text-white outline-none transition focus:border-nzu-green/60 focus:bg-white/[0.05]"
            placeholder="YouTube 또는 SOOP URL"
          />
        </label>
      </div>

      {shouldPreviewImage ? (
        <div className="max-w-sm overflow-hidden rounded-xl border border-white/10 bg-white/[0.03]">
          <Image
            src={imageUrl}
            alt="게시글 이미지 미리보기"
            width={384}
            height={216}
            unoptimized
            className="max-h-40 w-full object-contain"
          />
          <button
            type="button"
            onClick={() => {
              setImageUrl("");
              setImageUploadState(initialImageUploadState);
            }}
            className="w-full border-t border-white/8 px-3 py-2 text-xs font-black text-white/62 transition hover:text-white"
          >
            이미지 제거
          </button>
        </div>
      ) : null}

      <div className="rounded-[1.2rem] border border-amber-300/18 bg-amber-300/8 px-4 py-3 text-sm font-medium leading-7 text-amber-100/88">
        이미지는 파일 선택 또는 붙여넣기(Ctrl+V)로 올릴 수 있어요. 영상은 YouTube 또는 SOOP 링크를 넣어 주세요.
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
          disabled={isSubmitting || isUploadingImage}
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
