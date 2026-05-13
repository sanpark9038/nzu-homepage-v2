"use client";

import Link from "next/link";
import { useMemo, useState } from "react";

import type { BoardPostRow } from "@/lib/board";
import { renderBoardContentToHtml } from "@/lib/board-content";

type ScheduleInfoListProps = {
  posts: BoardPostRow[];
  todayKey: string;
  minCalendarKey: string;
  maxCalendarKey: string;
};

type ViewMode = "day" | "week" | "month";
type DayFilter = "today" | "tomorrow" | "dayAfterTomorrow" | "all";

type CalendarDay = {
  dateKey: string;
  dayLabel: string;
  isToday: boolean;
  isCurrentMonth: boolean;
};

const VIEW_MODES: { value: ViewMode; label: string }[] = [
  { value: "day", label: "일별" },
  { value: "week", label: "주별" },
  { value: "month", label: "월별" },
];

const DAY_FILTERS: { value: DayFilter; label: string }[] = [
  { value: "today", label: "오늘" },
  { value: "tomorrow", label: "내일" },
  { value: "dayAfterTomorrow", label: "모레" },
  { value: "all", label: "전체" },
];

const WEEKDAY_LABELS = ["일", "월", "화", "수", "목", "금", "토"];

function toDateKey(date: Date) {
  const year = date.getUTCFullYear();
  const month = String(date.getUTCMonth() + 1).padStart(2, "0");
  const day = String(date.getUTCDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function dateFromKey(value: string) {
  const [year, month, day] = value.split("-").map(Number);
  return new Date(Date.UTC(year, month - 1, day));
}

function formatScheduleDate(value: string | null) {
  if (!value) return "";

  const date = dateFromKey(value);
  return new Intl.DateTimeFormat("ko-KR", {
    month: "long",
    day: "numeric",
    weekday: "long",
    timeZone: "UTC",
  }).format(date);
}

function formatCalendarTitle(value: string, viewMode: Exclude<ViewMode, "day">) {
  const date = dateFromKey(value);

  if (viewMode === "week") {
    const weekStart = getWeekStartDate(value);
    const weekEnd = new Date(weekStart);
    weekEnd.setUTCDate(weekEnd.getUTCDate() + 6);
    return `${formatMonthDay(weekStart)} - ${formatMonthDay(weekEnd)}`;
  }

  return new Intl.DateTimeFormat("ko-KR", {
    year: "numeric",
    month: "long",
    timeZone: "UTC",
  }).format(date);
}

function formatMonthDay(date: Date) {
  return new Intl.DateTimeFormat("ko-KR", {
    month: "long",
    day: "numeric",
    timeZone: "UTC",
  }).format(date);
}

function addDaysToDateKey(value: string, days: number) {
  const date = dateFromKey(value);
  date.setUTCDate(date.getUTCDate() + days);
  return toDateKey(date);
}

function addMonthsToDateKey(value: string, months: number) {
  const date = dateFromKey(value);
  date.setUTCDate(1);
  date.setUTCMonth(date.getUTCMonth() + months);
  return toDateKey(date);
}

function getWeekStartDate(value: string) {
  const date = dateFromKey(value);
  date.setUTCDate(date.getUTCDate() - date.getUTCDay());
  return date;
}

function buildCalendarDay(date: Date, todayKey: string, currentMonth: number): CalendarDay {
  const dateKey = toDateKey(date);
  return {
    dateKey,
    dayLabel: String(date.getUTCDate()),
    isToday: dateKey === todayKey,
    isCurrentMonth: date.getUTCMonth() === currentMonth,
  };
}

function buildWeekCalendarDays(anchorKey: string, todayKey: string) {
  const weekStart = getWeekStartDate(anchorKey);
  const currentMonth = dateFromKey(anchorKey).getUTCMonth();

  return Array.from({ length: 7 }, (_, index) => {
    const date = new Date(weekStart);
    date.setUTCDate(weekStart.getUTCDate() + index);
    return buildCalendarDay(date, todayKey, currentMonth);
  });
}

function buildMonthCalendarDays(anchorKey: string, todayKey: string) {
  const anchorDate = dateFromKey(anchorKey);
  const currentMonth = anchorDate.getUTCMonth();
  const monthStart = new Date(anchorDate);
  monthStart.setUTCDate(1);

  const gridStart = new Date(monthStart);
  gridStart.setUTCDate(monthStart.getUTCDate() - monthStart.getUTCDay());

  const nextMonthStart = new Date(monthStart);
  nextMonthStart.setUTCMonth(monthStart.getUTCMonth() + 1);
  const monthEnd = new Date(nextMonthStart);
  monthEnd.setUTCDate(nextMonthStart.getUTCDate() - 1);

  const gridEnd = new Date(monthEnd);
  gridEnd.setUTCDate(monthEnd.getUTCDate() + (6 - monthEnd.getUTCDay()));

  const days: CalendarDay[] = [];
  for (const date = new Date(gridStart); date <= gridEnd; date.setUTCDate(date.getUTCDate() + 1)) {
    days.push(buildCalendarDay(new Date(date), todayKey, currentMonth));
  }

  return days;
}

function isPostVisibleForDayFilter(post: BoardPostRow, dayFilter: DayFilter, todayKey: string) {
  const scheduleDate = post.schedule_date || "";
  if (!scheduleDate) return false;
  if (dayFilter === "all") return scheduleDate >= todayKey;
  if (dayFilter === "today") return scheduleDate === todayKey;
  if (dayFilter === "tomorrow") return scheduleDate === addDaysToDateKey(todayKey, 1);
  return scheduleDate === addDaysToDateKey(todayKey, 2);
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

function buildPostsByDate(posts: BoardPostRow[]) {
  const byDate = new Map<string, BoardPostRow[]>();
  for (const post of posts) {
    const key = post.schedule_date || "";
    if (!key) continue;
    byDate.set(key, [...(byDate.get(key) || []), post]);
  }
  return byDate;
}

function formatTimeLabel(value: string | null) {
  return value ? `${value.slice(0, 5)} 시작` : "시간 미정";
}

function getRangeLabel(dayFilter: DayFilter) {
  const activeFilter = DAY_FILTERS.find((filter) => filter.value === dayFilter);
  return activeFilter?.label || "오늘";
}

function getEmptyMessage(dayFilter: DayFilter) {
  if (dayFilter === "today") return "오늘 등록된 일정이 없습니다.";
  if (dayFilter === "tomorrow") return "내일 등록된 일정이 없습니다.";
  if (dayFilter === "dayAfterTomorrow") return "모레 등록된 일정이 없습니다.";
  return "등록된 일정이 없습니다.";
}

function getCalendarEmptyMessage(posts: BoardPostRow[], visibleCount: number) {
  if (posts.length === 0) return "예정된 경기가 없습니다.";
  if (visibleCount === 0) return "선택한 기간에 등록된 일정이 없습니다.";
  return "";
}

function getCalendarMoveTarget(viewMode: Exclude<ViewMode, "day">, cursorKey: string, direction: -1 | 1) {
  return viewMode === "week" ? addDaysToDateKey(cursorKey, direction * 7) : addMonthsToDateKey(cursorKey, direction);
}

function getCalendarDaysForView(viewMode: Exclude<ViewMode, "day">, cursorKey: string, todayKey: string) {
  return viewMode === "week" ? buildWeekCalendarDays(cursorKey, todayKey) : buildMonthCalendarDays(cursorKey, todayKey);
}

function isCalendarRangeWithinBounds(
  viewMode: Exclude<ViewMode, "day">,
  cursorKey: string,
  todayKey: string,
  minCalendarKey: string,
  maxCalendarKey: string
) {
  const days = getCalendarDaysForView(viewMode, cursorKey, todayKey);
  const firstDateKey = days[0]?.dateKey || cursorKey;
  const lastDateKey = days[days.length - 1]?.dateKey || cursorKey;
  return firstDateKey >= minCalendarKey && lastDateKey <= maxCalendarKey;
}

export function ScheduleInfoList({ posts, todayKey, minCalendarKey, maxCalendarKey }: ScheduleInfoListProps) {
  const [viewMode, setViewMode] = useState<ViewMode>("day");
  const [dayFilter, setDayFilter] = useState<DayFilter>("today");
  const [calendarCursorKey, setCalendarCursorKey] = useState(todayKey);

  const filteredPosts = useMemo(
    () => posts.filter((post) => isPostVisibleForDayFilter(post, dayFilter, todayKey)),
    [dayFilter, posts, todayKey]
  );
  const groupedPosts = groupPosts(filteredPosts);
  const postsByDate = useMemo(() => buildPostsByDate(posts), [posts]);
  const dayEmptyMessage = posts.length ? getEmptyMessage(dayFilter) : "예정된 경기가 없습니다.";
  const isCalendarView = viewMode !== "day";

  function moveCalendarCursor(direction: -1 | 1) {
    if (viewMode === "day") return;

    setCalendarCursorKey((current) => {
      const targetKey = getCalendarMoveTarget(viewMode, current, direction);
      if (!isCalendarRangeWithinBounds(viewMode, targetKey, todayKey, minCalendarKey, maxCalendarKey)) return current;
      return targetKey;
    });
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-3 border-b border-white/8 pb-5 md:flex-row md:items-end md:justify-between">
        <div className="space-y-3">
          <div className="flex flex-wrap gap-2">
            {VIEW_MODES.map((mode) => (
              <button
                key={mode.value}
                type="button"
                aria-pressed={viewMode === mode.value}
                onClick={() => setViewMode(mode.value)}
                className={
                  viewMode === mode.value
                    ? "min-h-10 rounded-xl bg-white px-4 text-sm font-black text-black"
                    : "min-h-10 rounded-xl border border-white/10 bg-white/[0.03] px-4 text-sm font-black text-white/68 transition hover:border-nzu-green/40 hover:text-white"
                }
              >
                {mode.label}
              </button>
            ))}
          </div>

          {viewMode === "day" ? (
            <div className="flex flex-wrap gap-2">
              {DAY_FILTERS.map((filter) => (
                <button
                  key={filter.value}
                  type="button"
                  aria-pressed={dayFilter === filter.value}
                  onClick={() => setDayFilter(filter.value)}
                  className={
                    dayFilter === filter.value
                      ? "min-h-9 rounded-xl bg-nzu-green px-3 text-xs font-black text-black"
                      : "min-h-9 rounded-xl border border-white/10 bg-black/20 px-3 text-xs font-black text-white/62 transition hover:border-nzu-green/40 hover:text-white"
                  }
                >
                  {filter.label}
                </button>
              ))}
            </div>
          ) : null}
        </div>

        <div className="text-xs font-black text-white/38 md:text-right">
          {viewMode === "day" ? getRangeLabel(dayFilter) : formatCalendarTitle(calendarCursorKey, viewMode)}
        </div>
      </div>

      {!isCalendarView ? (
        <ScheduleDayList groupedPosts={groupedPosts} emptyMessage={dayEmptyMessage} />
      ) : (
        <ScheduleCalendarView
          viewMode={viewMode}
          cursorKey={calendarCursorKey}
          todayKey={todayKey}
          posts={posts}
          postsByDate={postsByDate}
          minCalendarKey={minCalendarKey}
          maxCalendarKey={maxCalendarKey}
          onPrevious={() => moveCalendarCursor(-1)}
          onNext={() => moveCalendarCursor(1)}
          onToday={() => setCalendarCursorKey(todayKey)}
        />
      )}
    </div>
  );
}

function ScheduleDayList({
  groupedPosts,
  emptyMessage,
}: {
  groupedPosts: [string, BoardPostRow[]][];
  emptyMessage: string;
}) {
  if (!groupedPosts.length) {
    return (
      <div className="rounded-[1.4rem] border border-dashed border-white/12 bg-white/[0.02] px-5 py-12 text-center">
        <p className="text-sm font-medium text-white/55">{emptyMessage}</p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
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

function ScheduleCalendarView({
  viewMode,
  cursorKey,
  todayKey,
  posts,
  postsByDate,
  minCalendarKey,
  maxCalendarKey,
  onPrevious,
  onNext,
  onToday,
}: {
  viewMode: Exclude<ViewMode, "day">;
  cursorKey: string;
  todayKey: string;
  posts: BoardPostRow[];
  postsByDate: Map<string, BoardPostRow[]>;
  minCalendarKey: string;
  maxCalendarKey: string;
  onPrevious: () => void;
  onNext: () => void;
  onToday: () => void;
}) {
  const days = getCalendarDaysForView(viewMode, cursorKey, todayKey);
  const visibleCount = days.reduce((count, day) => count + (postsByDate.get(day.dateKey)?.length || 0), 0);
  const emptyMessage = getCalendarEmptyMessage(posts, visibleCount);
  const canMovePrevious = isCalendarRangeWithinBounds(
    viewMode,
    getCalendarMoveTarget(viewMode, cursorKey, -1),
    todayKey,
    minCalendarKey,
    maxCalendarKey
  );
  const canMoveNext = isCalendarRangeWithinBounds(
    viewMode,
    getCalendarMoveTarget(viewMode, cursorKey, 1),
    todayKey,
    minCalendarKey,
    maxCalendarKey
  );

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={onPrevious}
            disabled={!canMovePrevious}
            className="inline-flex min-h-10 items-center rounded-xl border border-white/12 bg-white/[0.03] px-3 text-sm font-black text-white transition hover:border-nzu-green/45 disabled:cursor-not-allowed disabled:opacity-35"
          >
            이전
          </button>
          <button
            type="button"
            onClick={onToday}
            className="inline-flex min-h-10 items-center rounded-xl border border-white/12 bg-white/[0.03] px-4 text-sm font-black text-white transition hover:border-nzu-green/45"
          >
            오늘
          </button>
          <button
            type="button"
            onClick={onNext}
            disabled={!canMoveNext}
            className="inline-flex min-h-10 items-center rounded-xl border border-white/12 bg-white/[0.03] px-3 text-sm font-black text-white transition hover:border-nzu-green/45 disabled:cursor-not-allowed disabled:opacity-35"
          >
            다음
          </button>
        </div>
        <div className="text-xs font-black text-white/42">{visibleCount}건</div>
      </div>

      <div className="-mx-4 overflow-x-auto px-4 md:mx-0 md:px-0">
        <div className="schedule-calendar-grid min-w-[720px] overflow-hidden rounded-[1.1rem] border border-white/12 bg-[#07111f]">
          <div className="grid grid-cols-7 border-b border-white/12 bg-white/[0.05]">
            {WEEKDAY_LABELS.map((label) => (
              <div key={label} className="px-3 py-3 text-center text-xs font-black text-white/70">
                {label}
              </div>
            ))}
          </div>
          <div className="grid grid-cols-7">
            {days.map((day) => {
              const dayPosts = postsByDate.get(day.dateKey) || [];

              return (
                <div
                  key={day.dateKey}
                  className={
                    day.isToday
                      ? "min-h-[8.5rem] border-b border-r border-sky-300/25 bg-sky-500/10 p-2"
                      : "min-h-[8.5rem] border-b border-r border-white/10 bg-white/[0.01] p-2"
                  }
                >
                  <div className="mb-2 flex items-center justify-between gap-2">
                    <span
                      className={
                        day.isToday
                          ? "inline-flex h-7 min-w-7 items-center justify-center rounded-full bg-nzu-green px-2 text-xs font-black text-black"
                          : day.isCurrentMonth
                            ? "text-xs font-black text-white"
                            : "text-xs font-black text-white/28"
                      }
                    >
                      {day.dayLabel}
                    </span>
                    {dayPosts.length ? <span className="text-[10px] font-black text-sky-100/70">{dayPosts.length}</span> : null}
                  </div>

                  <div className="max-h-[7.25rem] space-y-1.5 overflow-y-auto pr-1">
                    {dayPosts.map((post) => (
                      <ScheduleCalendarEvent key={post.id} post={post} />
                    ))}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </div>

      {emptyMessage ? (
        <div className="rounded-[1.1rem] border border-dashed border-white/12 bg-white/[0.02] px-5 py-8 text-center">
          <p className="text-sm font-medium text-white/55">{emptyMessage}</p>
        </div>
      ) : null}
    </div>
  );
}

function ScheduleCalendarEvent({ post }: { post: BoardPostRow }) {
  return (
    <details className="group rounded-lg border border-white/8 bg-black/24 px-2 py-1.5 open:bg-black/40">
      <summary className="cursor-pointer marker:content-none">
        <div className="line-clamp-1 text-[11px] font-black leading-5 text-white">
          {post.schedule_start_time ? <span className="mr-1 text-nzu-green">{post.schedule_start_time.slice(0, 5)}</span> : null}
          {post.title}
        </div>
        <div className="line-clamp-1 text-[10px] font-bold text-white/46">{post.schedule_display_name}</div>
      </summary>
      <div className="mt-2 border-t border-white/8 pt-2">
        <ScheduleInfoBody post={post} compact />
      </div>
    </details>
  );
}

function ScheduleInfoCard({ post }: { post: BoardPostRow }) {
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
        <ScheduleInfoBody post={post} />
      </div>
    </details>
  );
}

function ScheduleInfoBody({ post, compact = false }: { post: BoardPostRow; compact?: boolean }) {
  const renderedContent = renderBoardContentToHtml(post.content);

  return (
    <>
      <div
        className={
          compact
            ? "max-w-none space-y-2 text-xs font-medium leading-6 text-white/70 [&_a]:font-bold [&_a]:text-nzu-green [&_p]:my-0"
            : "max-w-none space-y-2 text-sm font-medium leading-7 text-white/72 [&_a]:font-bold [&_a]:text-nzu-green [&_p]:my-0"
        }
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
    </>
  );
}
