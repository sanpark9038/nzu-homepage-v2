"use client";

import Link from "next/link";
import { useMemo, useState } from "react";

import type { BoardPostRow } from "@/lib/board";
import { renderBoardContentToHtml } from "@/lib/board-content";

type ScheduleInfoListProps = {
  posts: BoardPostRow[];
  todayKey: string;
};

type FilterMode = "all" | "today" | "tomorrow" | "week";

const FILTERS: { value: FilterMode; label: string }[] = [
  { value: "all", label: "전체" },
  { value: "today", label: "오늘" },
  { value: "tomorrow", label: "내일" },
  { value: "week", label: "7일" },
];

function formatScheduleDate(value: string | null) {
  if (!value) return "";

  const date = new Date(`${value}T00:00:00+09:00`);
  return new Intl.DateTimeFormat("ko-KR", {
    month: "long",
    day: "numeric",
    weekday: "long",
    timeZone: "Asia/Seoul",
  }).format(date);
}

function addDaysToDateKey(value: string, days: number) {
  const date = new Date(`${value}T00:00:00+09:00`);
  date.setDate(date.getDate() + days);

  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Seoul",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(date);
}

function isPostVisibleForFilter(post: BoardPostRow, filterMode: FilterMode, todayKey: string) {
  const scheduleDate = post.schedule_date || "";
  if (filterMode === "all") return true;
  if (filterMode === "today") return scheduleDate === todayKey;
  if (filterMode === "tomorrow") return scheduleDate === addDaysToDateKey(todayKey, 1);
  return scheduleDate >= todayKey && scheduleDate <= addDaysToDateKey(todayKey, 6);
}

function groupPosts(posts: BoardPostRow[]) {
  const byDate = new Map<string, BoardPostRow[]>();
  for (const post of posts) {
    const key = post.schedule_date || "";
    if (!key) continue;
    byDate.set(key, [...(byDate.get(key) || []), post]);
  }
  return Array.from(byDate.entries());
}

function formatTimeLabel(value: string | null) {
  return value ? `${value.slice(0, 5)} 시작` : "시간 미정";
}

export function ScheduleInfoList({ posts, todayKey }: ScheduleInfoListProps) {
  const [filterMode, setFilterMode] = useState<FilterMode>("all");
  const filteredPosts = useMemo(
    () => posts.filter((post) => isPostVisibleForFilter(post, filterMode, todayKey)),
    [filterMode, posts, todayKey]
  );
  const groupedPosts = groupPosts(filteredPosts);

  if (!posts.length) {
    return (
      <div className="rounded-[1.4rem] border border-dashed border-white/12 bg-white/[0.02] px-5 py-16 text-center">
        <p className="text-sm font-medium text-white/55">예정된 경기가 없습니다.</p>
      </div>
    );
  }

  return (
    <div className="space-y-8">
      <div className="flex flex-wrap gap-2">
        {FILTERS.map((filter) => (
          <button
            key={filter.value}
            type="button"
            aria-pressed={filterMode === filter.value}
            onClick={() => setFilterMode(filter.value)}
            className={
              filterMode === filter.value
                ? "rounded-xl bg-white px-4 py-2 text-sm font-black text-black"
                : "rounded-xl border border-white/10 bg-white/[0.03] px-4 py-2 text-sm font-black text-white/68 transition hover:border-nzu-green/40 hover:text-white"
            }
          >
            {filter.label}
          </button>
        ))}
      </div>

      {filteredPosts.length === 0 ? (
        <div className="rounded-[1.4rem] border border-dashed border-white/12 bg-white/[0.02] px-5 py-12 text-center">
          <p className="text-sm font-medium text-white/55">선택한 기간에 등록된 정보/일정이 없습니다.</p>
        </div>
      ) : null}

      {groupedPosts.map(([date, datePosts]) => {
        const timedPosts = datePosts.filter((post) => post.schedule_start_time);
        const untimedPosts = datePosts.filter((post) => !post.schedule_start_time);

        return (
          <section key={date} className="space-y-3">
            <div className="sticky top-20 z-10 inline-flex rounded-full border border-white/10 bg-card/90 px-4 py-2 text-sm font-black text-white shadow-sm backdrop-blur">
              {formatScheduleDate(date)}
            </div>
            <div className="space-y-3">
              {timedPosts.map((post) => (
                <ScheduleInfoCard key={post.id} post={post} />
              ))}
              {untimedPosts.length ? (
                <div className="pt-2">
                  <div className="mb-2 px-1 text-xs font-black text-white/52">시간 미정</div>
                  <div className="space-y-3">
                    {untimedPosts.map((post) => (
                      <ScheduleInfoCard key={post.id} post={post} />
                    ))}
                  </div>
                </div>
              ) : null}
            </div>
          </section>
        );
      })}
    </div>
  );
}

function ScheduleInfoCard({ post }: { post: BoardPostRow }) {
  const renderedContent = renderBoardContentToHtml(post.content);

  return (
    <details className="group overflow-hidden rounded-[1.1rem] border border-white/10 bg-card/55 transition hover:border-nzu-green/35">
      <summary className="grid cursor-pointer grid-cols-[4.75rem_minmax(0,1fr)_auto] items-center gap-3 px-4 py-3 marker:content-none">
        <div className="flex min-h-[3.75rem] w-[4.25rem] flex-col items-center justify-center rounded-xl border border-sky-300/45 bg-black/20 px-2 text-center">
          <strong className="max-w-full truncate text-sm font-black text-white">{post.schedule_display_name}</strong>
          <span className="mt-1 text-[10px] font-black text-white/42">일정</span>
        </div>
        <div className="min-w-0">
          <div className="truncate text-base font-black tracking-tight text-white">{post.title}</div>
          <div className="mt-2 flex flex-wrap items-center gap-2 text-xs font-bold text-white/50">
            <span className="rounded-full bg-sky-400/12 px-2 py-1 text-sky-100">정보/일정</span>
            <span>{formatTimeLabel(post.schedule_start_time)}</span>
          </div>
        </div>
        <span className="text-xl text-white/38 transition group-open:rotate-180">⌄</span>
      </summary>
      <div className="border-t border-white/8 px-4 py-4 md:pl-[6.25rem]">
        <div
          className="max-w-none space-y-2 text-sm font-medium leading-7 text-white/72 [&_a]:font-bold [&_a]:text-nzu-green [&_p]:my-0"
          dangerouslySetInnerHTML={{ __html: renderedContent }}
        />
        <div className="mt-4 flex flex-wrap gap-2">
          {post.external_link_url ? (
            <a
              href={post.external_link_url}
              className="inline-flex min-h-10 items-center rounded-xl bg-nzu-green px-4 text-xs font-black text-black"
              target="_blank"
              rel="noreferrer"
            >
              링크 열기
            </a>
          ) : null}
          <Link
            href={`/board/${post.id}`}
            className="inline-flex min-h-10 items-center rounded-xl border border-white/12 bg-white/[0.04] px-4 text-xs font-black text-white"
          >
            게시글 자세히 보기
          </Link>
        </div>
      </div>
    </details>
  );
}
