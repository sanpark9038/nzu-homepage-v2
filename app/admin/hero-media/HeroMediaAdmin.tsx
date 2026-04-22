"use client";
/* eslint-disable @next/next/no-img-element */

import { useEffect, useState } from "react";
import { getAdminWriteDisabledMessage } from "@/lib/admin-runtime";

type HeroMediaEntry = {
  id: string;
  url: string;
  type: string;
  is_active: boolean | null;
  created_at: string | null;
};

const MAX_RECOMMENDED_VIDEO_SIZE_MB = 50;

export default function HeroMediaAdmin({
  initialMedia,
  readOnly = false,
}: {
  initialMedia: HeroMediaEntry[];
  readOnly?: boolean;
}) {
  const [media, setMedia] = useState<HeroMediaEntry[]>(initialMedia);
  const [message, setMessage] = useState("");
  const [loading, setLoading] = useState(false);
  const [file, setFile] = useState<File | null>(null);
  const [activateOnUpload, setActivateOnUpload] = useState(true);
  const [pendingDeleteId, setPendingDeleteId] = useState<string | null>(null);

  useEffect(() => {
    setMedia(initialMedia);
  }, [initialMedia]);

  async function refreshMedia() {
    setLoading(true);
    try {
      const res = await fetch("/api/admin/hero-media", { cache: "no-store" });
      const json = await res.json();
      if (!res.ok) throw new Error(json.message || "히어로 미디어를 불러오지 못했습니다.");
      setMedia(json.media || []);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "히어로 미디어를 불러오지 못했습니다.");
    } finally {
      setLoading(false);
    }
  }

  async function uploadMedia() {
    if (readOnly) {
      setMessage(getAdminWriteDisabledMessage("히어로 미디어 수정"));
      return;
    }
    if (!file) {
      setMessage("업로드할 이미지 또는 영상을 먼저 선택해주세요.");
      return;
    }

    const isVideo = String(file.type || "").toLowerCase().startsWith("video/");
    const fileSizeMb = file.size / (1024 * 1024);
    if (isVideo && fileSizeMb > MAX_RECOMMENDED_VIDEO_SIZE_MB) {
      setMessage(`영상 파일이 너무 큽니다. ${MAX_RECOMMENDED_VIDEO_SIZE_MB}MB 이하 mp4 또는 webm을 권장합니다.`);
      return;
    }

    setLoading(true);
    setMessage("");
    try {
      const formData = new FormData();
      formData.set("file", file);
      formData.set("activate", String(activateOnUpload));

      const res = await fetch("/api/admin/hero-media", {
        method: "POST",
        body: formData,
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.message || "히어로 미디어 업로드에 실패했습니다.");

      setMedia(json.media || []);
      setFile(null);
      setActivateOnUpload(true);
      setMessage("히어로 미디어를 업로드했습니다.");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "히어로 미디어 업로드에 실패했습니다.");
    } finally {
      setLoading(false);
    }
  }

  async function setActive(id: string) {
    if (readOnly) {
      setMessage(getAdminWriteDisabledMessage("히어로 미디어 수정"));
      return;
    }
    setLoading(true);
    setMessage("");
    try {
      const res = await fetch("/api/admin/hero-media", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id, is_active: true }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.message || "대표 히어로 미디어 변경에 실패했습니다.");
      setMedia(json.media || []);
      setMessage("대표 히어로 미디어를 변경했습니다.");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "대표 히어로 미디어 변경에 실패했습니다.");
    } finally {
      setLoading(false);
    }
  }

  async function deleteMedia(id: string) {
    if (readOnly) {
      setMessage(getAdminWriteDisabledMessage("히어로 미디어 수정"));
      return;
    }
    if (pendingDeleteId !== id) {
      setPendingDeleteId(id);
      setMessage("같은 삭제 버튼을 한 번 더 누르면 Supabase 저장소 파일까지 함께 삭제됩니다.");
      return;
    }

    setLoading(true);
    setMessage("");
    try {
      const res = await fetch(`/api/admin/hero-media?id=${encodeURIComponent(id)}`, {
        method: "DELETE",
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.message || "히어로 미디어 삭제에 실패했습니다.");
      setMedia(json.media || []);
      setPendingDeleteId(null);
      setMessage("히어로 미디어와 Supabase 저장소 파일을 함께 삭제했습니다.");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "히어로 미디어 삭제에 실패했습니다.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="space-y-8">
      <section className="rounded-[2rem] border border-white/10 bg-card p-6">
        <div className="space-y-2">
          <h2 className="text-xl font-black tracking-tight text-white">히어로 미디어 업로드</h2>
          <p className="text-sm text-white/55">
            메인 페이지 첫 화면에 보일 대표 이미지 또는 영상을 등록합니다. 영상은 50MB 이하 mp4 또는 webm을 권장합니다.
          </p>
        </div>

        <div className="mt-5 grid gap-4 lg:grid-cols-[minmax(0,1fr)_auto]">
          <div className="space-y-3">
            <input
              type="file"
              accept=".jpg,.jpeg,.png,.webp,.mp4,.webm,image/*,video/mp4,video/webm"
              disabled={readOnly}
              onChange={(event) => setFile(event.target.files?.[0] || null)}
              className="block w-full rounded-xl border border-white/10 bg-background px-4 py-3 text-sm font-bold text-white file:mr-4 file:rounded-lg file:border-0 file:bg-white/10 file:px-4 file:py-2 file:text-sm file:font-black file:text-white"
            />
            <label className="flex items-center gap-2 text-sm font-bold text-white/80">
              <input
                type="checkbox"
                checked={activateOnUpload}
                disabled={readOnly}
                onChange={(event) => setActivateOnUpload(event.target.checked)}
                className="h-4 w-4 rounded border-white/20 bg-background"
              />
              업로드 후 바로 대표 히어로로 적용
            </label>
          </div>

          <button
            onClick={uploadMedia}
            disabled={loading || readOnly}
            className="inline-flex min-h-12 items-center justify-center rounded-xl bg-nzu-green px-5 text-sm font-black text-black disabled:opacity-50"
          >
            업로드
          </button>
        </div>
      </section>

      <section className="rounded-[2rem] border border-white/10 bg-card p-6">
        <div className="flex items-center justify-between gap-3">
          <div>
            <h2 className="text-xl font-black tracking-tight text-white">등록된 히어로 미디어</h2>
            <p className="text-sm text-white/55">대표로 적용된 항목 하나만 메인 Hero에서 우선 노출됩니다.</p>
          </div>
          <button
            onClick={refreshMedia}
            disabled={loading}
            className="rounded-xl border border-white/10 px-4 py-2 text-sm font-black text-white/75 hover:bg-white/5 disabled:opacity-50"
          >
            새로고침
          </button>
        </div>

        <div className="mt-5 grid gap-4 xl:grid-cols-2">
          {media.map((entry) => (
            <article key={entry.id} className="overflow-hidden rounded-3xl border border-white/10 bg-background/80">
              <div className="relative aspect-[16/9] bg-black">
                {entry.type === "video" ? (
                  <video src={entry.url} controls muted playsInline className="h-full w-full object-cover" />
                ) : (
                  <img src={entry.url} alt="히어로 미디어 미리보기" className="h-full w-full object-cover" />
                )}
                <div className="absolute left-3 top-3 flex gap-2">
                  <span className="rounded-full bg-black/65 px-3 py-1 text-[11px] font-black tracking-[0.14em] text-white">
                    {entry.type === "video" ? "영상" : "이미지"}
                  </span>
                  {entry.is_active ? (
                    <span className="rounded-full bg-nzu-green px-3 py-1 text-[11px] font-black tracking-[0.14em] text-black">
                      대표 노출 중
                    </span>
                  ) : null}
                </div>
              </div>

              <div className="space-y-4 p-5">
                <div className="space-y-1">
                  <p className="text-xs font-bold uppercase tracking-[0.18em] text-white/40">등록 시각</p>
                  <p className="text-sm font-bold text-white/80">{entry.created_at || "-"}</p>
                </div>

                <div className="flex flex-wrap gap-3">
                  <button
                    type="button"
                    onClick={() => setActive(entry.id)}
                    disabled={loading || Boolean(entry.is_active) || readOnly}
                    className="inline-flex min-h-11 items-center justify-center rounded-xl bg-nzu-green px-4 text-sm font-black text-black disabled:opacity-50"
                  >
                    대표로 적용
                  </button>
                  <button
                    type="button"
                    onClick={() => deleteMedia(entry.id)}
                    disabled={loading || readOnly}
                    className={`inline-flex min-h-11 items-center justify-center rounded-xl px-4 text-sm font-black disabled:opacity-50 ${
                      pendingDeleteId === entry.id
                        ? "border border-red-300/60 bg-red-500/20 text-red-100"
                        : "border border-red-400/30 bg-red-500/10 text-red-200"
                    }`}
                  >
                    {pendingDeleteId === entry.id ? "한 번 더 삭제" : "삭제"}
                  </button>
                </div>
              </div>
            </article>
          ))}
        </div>

        {media.length === 0 ? (
          <p className="mt-5 rounded-2xl border border-dashed border-white/10 px-4 py-6 text-sm font-bold text-white/45">
            아직 등록된 히어로 미디어가 없습니다.
          </p>
        ) : null}
      </section>

      {message ? <p className="text-sm font-bold text-white/75">{message}</p> : null}
    </div>
  );
}
