"use client";

import { useRouter } from "next/navigation";
import { startTransition, useRef, useState, type ChangeEvent, type FormEvent } from "react";

import type { BoardPostRow } from "@/lib/board";

type SchedulePostComposerProps = {
  existingPosts: BoardPostRow[];
};

type FormState = {
  message: string;
  tone: "idle" | "success" | "error";
};

const initialState: FormState = { message: "", tone: "idle" };

function toTimeInputValue(value: string | null) {
  return value ? value.slice(0, 5) : "";
}

export function SchedulePostComposer({ existingPosts }: SchedulePostComposerProps) {
  const router = useRouter();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [editingPostId, setEditingPostId] = useState<string | null>(null);
  const [title, setTitle] = useState("");
  const [content, setContent] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [scheduleDate, setScheduleDate] = useState("");
  const [scheduleStartTime, setScheduleStartTime] = useState("");
  const [imageUrl, setImageUrl] = useState("");
  const [videoUrl, setVideoUrl] = useState("");
  const [externalLinkUrl, setExternalLinkUrl] = useState("");
  const [published, setPublished] = useState(true);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isUploadingImage, setIsUploadingImage] = useState(false);
  const [busyPostId, setBusyPostId] = useState<string | null>(null);
  const [state, setState] = useState<FormState>(initialState);

  function resetForm() {
    setEditingPostId(null);
    setTitle("");
    setContent("");
    setDisplayName("");
    setScheduleDate("");
    setScheduleStartTime("");
    setImageUrl("");
    setVideoUrl("");
    setExternalLinkUrl("");
    setPublished(true);
    if (fileInputRef.current) fileInputRef.current.value = "";
  }

  function fillFromPost(post: BoardPostRow) {
    setEditingPostId(post.id);
    setTitle(post.title);
    setContent(post.content);
    setDisplayName(post.schedule_display_name || "");
    setScheduleDate(post.schedule_date || "");
    setScheduleStartTime(toTimeInputValue(post.schedule_start_time));
    setImageUrl(post.image_url || "");
    setVideoUrl(post.video_url || "");
    setExternalLinkUrl(post.external_link_url || "");
    setPublished(post.published !== false);
    setState(initialState);
  }

  async function uploadImageFile(file: File) {
    setIsUploadingImage(true);
    setState(initialState);

    try {
      const formData = new FormData();
      formData.append("file", file);
      const response = await fetch("/api/board/images", { method: "POST", body: formData });
      const payload = (await response.json().catch(() => ({}))) as {
        ok?: boolean;
        message?: string;
        image?: { url?: string };
      };

      if (!response.ok || !payload.ok || !payload.image?.url) {
        throw new Error(payload.message || "이미지 업로드에 실패했습니다.");
      }

      setImageUrl(payload.image.url);
      setState({ tone: "success", message: "이미지가 업로드되었습니다." });
    } catch (error) {
      setState({ tone: "error", message: error instanceof Error ? error.message : "이미지 업로드에 실패했습니다." });
    } finally {
      setIsUploadingImage(false);
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  }

  function buildScheduleBody(overrides: Partial<Record<string, unknown>> = {}) {
    return {
      title,
      content,
      schedule_display_name: displayName,
      schedule_date: scheduleDate,
      schedule_start_time: scheduleStartTime,
      image_url: imageUrl,
      video_url: videoUrl,
      external_link_url: externalLinkUrl,
      published,
      ...overrides,
    };
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setIsSubmitting(true);
    setState(initialState);

    try {
      const body = buildScheduleBody();
      const response = await fetch(editingPostId ? `/api/admin/schedule/${editingPostId}` : "/api/admin/schedule", {
        method: editingPostId ? "PATCH" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const payload = (await response.json().catch(() => ({}))) as { ok?: boolean; message?: string };
      if (!response.ok || !payload.ok) throw new Error(payload.message || "정보/일정 저장에 실패했습니다.");

      if (!editingPostId) {
        resetForm();
      }
      setState({ tone: "success", message: "정보/일정이 저장되었습니다." });
      startTransition(() => router.refresh());
    } catch (error) {
      setState({ tone: "error", message: error instanceof Error ? error.message : "정보/일정 저장에 실패했습니다." });
    } finally {
      setIsSubmitting(false);
    }
  }

  async function setPublishedForPost(post: BoardPostRow, nextPublished: boolean) {
    const body =
      editingPostId === post.id
        ? buildScheduleBody({ published: nextPublished })
        : {
            title: post.title,
            content: post.content,
            schedule_display_name: post.schedule_display_name,
            schedule_date: post.schedule_date,
            schedule_start_time: toTimeInputValue(post.schedule_start_time),
            image_url: post.image_url,
            video_url: post.video_url,
            external_link_url: post.external_link_url,
            published: nextPublished,
          };

    const response = await fetch(`/api/admin/schedule/${post.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    const payload = (await response.json().catch(() => ({}))) as { ok?: boolean; message?: string };
    if (!response.ok || !payload.ok) throw new Error(payload.message || "공개 상태 변경에 실패했습니다.");
  }

  async function deletePost(postId: string) {
    const response = await fetch(`/api/admin/schedule/${postId}`, { method: "DELETE" });
    const payload = (await response.json().catch(() => ({}))) as { ok?: boolean; message?: string };
    if (!response.ok || !payload.ok) throw new Error(payload.message || "일정 삭제에 실패했습니다.");
  }

  async function handleFileChange(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (file) await uploadImageFile(file);
  }

  return (
    <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_22rem]">
      <form
        onSubmit={handleSubmit}
        className="space-y-5 rounded-[1.6rem] border border-white/8 bg-[linear-gradient(180deg,rgba(10,16,18,0.98),rgba(7,10,11,0.94))] p-5 shadow-[0_22px_70px_rgba(0,0,0,0.16)]"
      >
        <section className="rounded-[1.25rem] border border-white/8 bg-white/[0.02] p-4">
          <div className="mb-4 flex items-start justify-between gap-3">
            <div>
              <h2 className="text-lg font-black text-white">일정 정보</h2>
              <p className="mt-1 text-xs font-bold text-white/52">일정 페이지에 보이는 핵심 정보입니다.</p>
            </div>
            <span className="rounded-full border border-nzu-green/30 bg-nzu-green/10 px-3 py-1 text-[11px] font-black text-nzu-green">
              관리자 전용
            </span>
          </div>

          <div className="grid gap-4 md:grid-cols-2">
            <label className="space-y-2 text-sm font-bold text-white/72">
              <span>
                대표 표시명 <span className="text-nzu-green">필수</span>
              </span>
              <input
                name="schedule_display_name"
                value={displayName}
                onChange={(event) => setDisplayName(event.target.value)}
                className="w-full rounded-xl border border-white/10 bg-white/[0.03] px-4 py-3 text-sm font-medium text-white outline-none transition focus:border-nzu-green/60"
                placeholder="예: 해링, 싸나인, ASL, 8강, KCM"
                maxLength={24}
              />
            </label>
            <label className="space-y-2 text-sm font-bold text-white/72">
              <span>
                일정 날짜 <span className="text-nzu-green">필수</span>
              </span>
              <input
                name="schedule_date"
                type="date"
                value={scheduleDate}
                onChange={(event) => setScheduleDate(event.target.value)}
                className="w-full rounded-xl border border-white/10 bg-white/[0.03] px-4 py-3 text-sm font-medium text-white outline-none transition focus:border-nzu-green/60"
              />
            </label>
            <label className="space-y-2 text-sm font-bold text-white/72">
              <span>
                시작시간 <span className="text-white/42">선택</span>
              </span>
              <input
                name="schedule_start_time"
                type="time"
                value={scheduleStartTime}
                onChange={(event) => setScheduleStartTime(event.target.value)}
                className="w-full rounded-xl border border-white/10 bg-white/[0.03] px-4 py-3 text-sm font-medium text-white outline-none transition focus:border-nzu-green/60"
              />
            </label>
            <label className="space-y-2 text-sm font-bold text-white/72">
              <span>
                방송 링크 <span className="text-white/42">선택</span>
              </span>
              <input
                name="external_link_url"
                value={externalLinkUrl}
                onChange={(event) => setExternalLinkUrl(event.target.value)}
                className="w-full rounded-xl border border-white/10 bg-white/[0.03] px-4 py-3 text-sm font-medium text-white outline-none transition focus:border-nzu-green/60"
                placeholder="SOOP, YouTube 등"
              />
            </label>
          </div>
        </section>

        <section className="space-y-4 rounded-[1.25rem] border border-white/8 bg-white/[0.02] p-4">
          <h2 className="text-lg font-black text-white">게시글 내용</h2>
          <label className="block space-y-2 text-sm font-bold text-white/72">
            <span>
              제목 <span className="text-nzu-green">필수</span>
            </span>
            <input
              value={title}
              onChange={(event) => setTitle(event.target.value)}
              className="w-full rounded-xl border border-white/10 bg-white/[0.03] px-4 py-3 text-sm font-medium text-white outline-none transition focus:border-nzu-green/60"
              placeholder="예: 해링 팀 합방 - 다음이 어려 만들기"
              maxLength={120}
            />
          </label>
          <label className="block space-y-2 text-sm font-bold text-white/72">
            <span>
              본문 <span className="text-nzu-green">필수</span>
            </span>
            <textarea
              value={content}
              onChange={(event) => setContent(event.target.value)}
              className="min-h-[300px] w-full rounded-[1.2rem] border border-white/10 bg-white/[0.03] px-4 py-3 text-sm font-medium leading-7 text-white outline-none transition focus:border-nzu-green/60"
              placeholder="일정 클릭 시 펼쳐지는 내용이며 게시글 상세에도 그대로 표시됩니다."
              maxLength={4000}
            />
          </label>
        </section>

        <section className="grid gap-4 rounded-[1.25rem] border border-white/8 bg-white/[0.02] p-4 md:grid-cols-2">
          <div className="space-y-2 text-sm font-bold text-white/72">
            <label htmlFor="schedule-image-url">
              이미지 URL <span className="text-white/42">선택</span>
            </label>
            <input
              id="schedule-image-url"
              value={imageUrl}
              onChange={(event) => setImageUrl(event.target.value)}
              className="w-full rounded-xl border border-white/10 bg-white/[0.03] px-4 py-3 text-sm font-medium text-white outline-none transition focus:border-nzu-green/60"
              placeholder="이미지 URL"
            />
            <label className="block space-y-2">
              <span className="text-white/52">이미지 파일 업로드</span>
              <input
                ref={fileInputRef}
                type="file"
                accept="image/jpeg,image/png,image/gif,image/webp"
                disabled={isUploadingImage}
                onChange={(event) => void handleFileChange(event)}
                className="w-full rounded-xl border border-white/10 bg-white/[0.03] px-4 py-3 text-sm font-bold text-white/72"
              />
            </label>
          </div>
          <label className="space-y-2 text-sm font-bold text-white/72">
            <span>
              영상 URL <span className="text-white/42">선택</span>
            </span>
            <input
              value={videoUrl}
              onChange={(event) => setVideoUrl(event.target.value)}
              className="w-full rounded-xl border border-white/10 bg-white/[0.03] px-4 py-3 text-sm font-medium text-white outline-none transition focus:border-nzu-green/60"
              placeholder="YouTube 또는 SOOP URL"
            />
          </label>
        </section>

        <label className="flex items-center gap-3 rounded-xl border border-white/8 bg-white/[0.02] px-4 py-3 text-sm font-bold text-white/72">
          <input type="checkbox" checked={published} onChange={(event) => setPublished(event.target.checked)} />
          일정 페이지와 게시판에 공개
        </label>

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

        <div className="flex flex-wrap gap-2">
          <button
            type="submit"
            disabled={isSubmitting || isUploadingImage}
            className="inline-flex min-h-12 items-center justify-center rounded-xl bg-nzu-green px-6 text-sm font-black text-black transition hover:-translate-y-0.5 disabled:translate-y-0 disabled:opacity-60"
          >
            {isSubmitting ? "저장 중..." : editingPostId ? "정보/일정 수정" : "정보/일정 등록"}
          </button>
          {editingPostId ? (
            <button
              type="button"
              onClick={resetForm}
              className="inline-flex min-h-12 items-center justify-center rounded-xl border border-white/12 bg-white/[0.04] px-6 text-sm font-black text-white"
            >
              새 글 작성
            </button>
          ) : null}
        </div>
      </form>

      <aside className="rounded-[1.6rem] border border-white/8 bg-white/[0.03] p-4">
        <h2 className="text-lg font-black text-white">등록된 정보/일정</h2>
        <div className="mt-4 space-y-3">
          {existingPosts.length ? (
            existingPosts.map((post) => (
              <div key={post.id} className="rounded-xl border border-white/8 bg-black/15 p-3">
                <div className="text-sm font-black text-white">{post.title}</div>
                <div className="mt-1 text-xs font-bold text-white/48">
                  {post.schedule_date || "-"} {toTimeInputValue(post.schedule_start_time) || "시간 미정"} ·{" "}
                  {post.published === false ? "비공개" : "공개"}
                </div>
                <div className="mt-3 flex flex-wrap gap-2">
                  <button
                    type="button"
                    onClick={() => fillFromPost(post)}
                    className="rounded-lg border border-white/10 px-3 py-2 text-xs font-black text-white/70"
                  >
                    수정
                  </button>
                  <button
                    type="button"
                    disabled={busyPostId === post.id}
                    onClick={async () => {
                      try {
                        setBusyPostId(post.id);
                        await setPublishedForPost(post, post.published === false);
                        setState({ tone: "success", message: "공개 상태가 변경되었습니다." });
                        startTransition(() => router.refresh());
                      } catch (error) {
                        setState({
                          tone: "error",
                          message: error instanceof Error ? error.message : "공개 상태 변경에 실패했습니다.",
                        });
                      } finally {
                        setBusyPostId(null);
                      }
                    }}
                    className="rounded-lg border border-white/10 px-3 py-2 text-xs font-black text-white/70 disabled:opacity-40"
                  >
                    {post.published === false ? "공개" : "비공개"}
                  </button>
                  <button
                    type="button"
                    disabled={busyPostId === post.id}
                    onClick={async () => {
                      if (!window.confirm("이 정보/일정을 삭제할까요?")) return;
                      try {
                        setBusyPostId(post.id);
                        await deletePost(post.id);
                        setState({ tone: "success", message: "일정이 삭제되었습니다." });
                        startTransition(() => router.refresh());
                      } catch (error) {
                        setState({
                          tone: "error",
                          message: error instanceof Error ? error.message : "일정 삭제에 실패했습니다.",
                        });
                      } finally {
                        setBusyPostId(null);
                      }
                    }}
                    className="rounded-lg border border-rose-400/24 px-3 py-2 text-xs font-black text-rose-200 disabled:opacity-40"
                  >
                    삭제
                  </button>
                </div>
              </div>
            ))
          ) : (
            <div className="rounded-xl border border-dashed border-white/10 px-4 py-8 text-center text-sm font-bold text-white/42">
              등록된 정보/일정이 없습니다.
            </div>
          )}
        </div>
      </aside>
    </div>
  );
}
