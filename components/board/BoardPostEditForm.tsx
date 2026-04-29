"use client";

import Image from "next/image";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useRef, useState } from "react";

type BoardPostEditFormProps = {
  post: {
    id: string;
    title: string;
    content: string;
    image_url: string | null;
    video_url: string | null;
  };
};

type FormState = {
  message: string;
  tone: "idle" | "success" | "error";
};

const initialState: FormState = { message: "", tone: "idle" };
const BOARD_IMAGE_ACCEPT = "image/jpeg,image/png,image/gif,image/webp";
const BOARD_IMAGE_MAX_BYTES = 10 * 1024 * 1024;
const BOARD_GIF_IMAGE_MAX_BYTES = 20 * 1024 * 1024;

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

function getBoardImageMaxBytes(file: File) {
  return file.type === "image/gif" ? BOARD_GIF_IMAGE_MAX_BYTES : BOARD_IMAGE_MAX_BYTES;
}

function validateImageFile(file: File) {
  if (!BOARD_IMAGE_ACCEPT.split(",").includes(file.type)) {
    return "jpg, png, gif, webp 이미지만 올릴 수 있어요.";
  }

  if (file.size > getBoardImageMaxBytes(file)) {
    return file.type === "image/gif"
      ? "GIF 이미지는 20MB 이하로 올려 주세요."
      : "이미지는 10MB 이하로 올려 주세요.";
  }

  return null;
}

export function BoardPostEditForm({ post }: BoardPostEditFormProps) {
  const router = useRouter();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const activeImageUploadIdRef = useRef(0);
  const [title, setTitle] = useState(post.title);
  const [content, setContent] = useState(post.content);
  const [imageUrl, setImageUrl] = useState(post.image_url || "");
  const [videoUrl, setVideoUrl] = useState(post.video_url || "");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isUploadingImage, setIsUploadingImage] = useState(false);
  const [state, setState] = useState<FormState>(initialState);
  const [imageUploadState, setImageUploadState] = useState<FormState>(initialState);
  const [isDraggingImage, setIsDraggingImage] = useState(false);

  const shouldPreviewImage = isPreviewableImageUrl(imageUrl);

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

  function handleImageDragOver(event: React.DragEvent<HTMLDivElement>) {
    event.preventDefault();
    event.dataTransfer.dropEffect = "copy";
    if (!isDraggingImage) setIsDraggingImage(true);
  }

  function handleImageDrop(event: React.DragEvent<HTMLDivElement>) {
    event.preventDefault();
    setIsDraggingImage(false);

    const imageFile = Array.from(event.dataTransfer.files).find((file) => file.type.startsWith("image/"));
    if (!imageFile) return;

    void uploadImageFile(imageFile);
  }

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setIsSubmitting(true);
    setState(initialState);

    try {
      const response = await fetch(`/api/board/${encodeURIComponent(post.id)}`, {
        method: "PATCH",
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
      const payload = (await response.json().catch(() => ({}))) as { ok?: boolean; message?: string };

      if (!response.ok || !payload.ok) {
        throw new Error(payload.message || "게시글을 수정하지 못했습니다.");
      }

      router.replace(`/board/${post.id}`);
      router.refresh();
    } catch (error) {
      setState({
        tone: "error",
        message: error instanceof Error ? error.message : "게시글을 수정하지 못했습니다.",
      });
      setIsSubmitting(false);
    }
  }

  return (
    <form
      onSubmit={handleSubmit}
      className="space-y-5 rounded-[1.6rem] border border-white/8 bg-[linear-gradient(180deg,rgba(10,16,18,0.98),rgba(7,10,11,0.94))] p-5 shadow-[0_22px_70px_rgba(0,0,0,0.16)]"
    >
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

      <label className="block space-y-2 text-sm font-bold text-white/72">
        <span>내용</span>
        <textarea
          value={content}
          onPaste={(event) => {
            const imageFile = Array.from(event.clipboardData.files).find((file) => file.type.startsWith("image/"));
            if (!imageFile) return;
            event.preventDefault();
            void uploadImageFile(imageFile);
          }}
          onChange={(event) => setContent(event.target.value)}
          className="min-h-[320px] w-full rounded-[1.2rem] border border-white/10 bg-white/[0.03] px-4 py-3 text-sm font-medium leading-7 text-white outline-none transition focus:border-nzu-green/60 focus:bg-white/[0.05]"
          placeholder="내용을 입력해 주세요"
          maxLength={4000}
        />
      </label>

      <div className="grid gap-4 md:grid-cols-2">
        <div
          className={[
            "space-y-2 rounded-xl border border-transparent p-0 text-sm font-bold text-white/72 transition",
            isDraggingImage ? "border-nzu-green/45 bg-nzu-green/8 p-3" : "",
          ].join(" ")}
          onDragEnter={handleImageDragOver}
          onDragOver={handleImageDragOver}
          onDragLeave={() => setIsDraggingImage(false)}
          onDrop={handleImageDrop}
        >
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
            accept={BOARD_IMAGE_ACCEPT}
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
              setImageUploadState(initialState);
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
              setImageUploadState(initialState);
            }}
            className="w-full border-t border-white/8 px-3 py-2 text-xs font-black text-white/62 transition hover:text-white"
          >
            이미지 제거
          </button>
        </div>
      ) : null}

      {state.message ? (
        <div className="rounded-xl border border-rose-400/24 bg-rose-500/10 px-4 py-3 text-sm font-bold text-rose-200">
          {state.message}
        </div>
      ) : null}

      <div className="flex flex-col gap-3 sm:flex-row">
        <button
          type="submit"
          disabled={isSubmitting || isUploadingImage}
          className="inline-flex min-h-12 items-center justify-center rounded-xl bg-nzu-green px-6 text-sm font-black tracking-tight text-black transition hover:-translate-y-0.5 disabled:translate-y-0 disabled:opacity-60"
        >
          {isSubmitting ? "수정 중..." : "수정"}
        </button>
        <Link
          href={`/board/${post.id}`}
          className="inline-flex min-h-12 items-center justify-center rounded-xl border border-white/12 bg-white/[0.03] px-6 text-sm font-black tracking-tight text-white/82 transition hover:border-white/22 hover:bg-white/[0.06]"
        >
          취소
        </Link>
      </div>
    </form>
  );
}
