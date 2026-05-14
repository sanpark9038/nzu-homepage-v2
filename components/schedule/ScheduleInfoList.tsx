"use client";

import Link from "next/link";
import { ChevronLeft, ChevronRight } from "lucide-react";
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
  weekday: number;
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
    weekday: date.getUTCDay(),
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
  if (posts.length === 0) return "예정된 일정이 없습니다.";
  if (visibleCount === 0) return "선택한 기간에 등록된 일정이 없습니다.";
  return "";
}

function getCalendarMoveTarget(viewMode: Exclude<ViewMode, "day">, cursorKey: string, direction: -1 | 1) {
  return viewMode === "week" ? addDaysToDateKey(cursorKey, direction * 7) : addMonthsToDateKey(cursorKey, direction);
}

function getCalendarDaysForView(viewMode: Exclude<ViewMode, "day">, cursorKey: string, todayKey: string) {
  return viewMode === "week" ? buildWeekCalendarDays(cursorKey, todayKey) : buildMonthCalendarDays(cursorKey, todayKey);
}

function getCalendarWeekdayClass(weekday: number) {
  if (weekday === 0) return "schedule-weekday-sunday text-rose-300";
  if (weekday === 6) return "schedule-weekday-saturday text-sky-300";
  return "text-white/74";
}

function getCalendarDateToneClass(day: CalendarDay) {
  if (day.weekday === 0) return day.isCurrentMonth ? "text-rose-300" : "text-rose-300/35";
  if (day.weekday === 6) return day.isCurrentMonth ? "text-sky-300" : "text-sky-300/35";
  return day.isCurrentMonth ? "text-white" : "text-white/28";
}

function getCalendarTodayDateClass(weekday: number) {
  if (weekday === 0) return "inline-flex h-8 min-w-8 items-center justify-center rounded-full bg-rose-400 px-2 text-sm font-black text-black";
  if (weekday === 6) return "inline-flex h-8 min-w-8 items-center justify-center rounded-full bg-sky-400 px-2 text-sm font-black text-black";
  return "inline-flex h-8 min-w-8 items-center justify-center rounded-full bg-nzu-green px-2 text-sm font-black text-black";
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
  const dayEmptyMessage = posts.length ? getEmptyMessage(dayFilter) : "예정된 일정이 없습니다.";
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
    <div className="schedule-readability-shell space-y-8 text-base md:text-lg">
      <div className="flex flex-col gap-4 border-b border-white/8 pb-6 md:flex-row md:items-end md:justify-between">
        <div className="space-y-4">
          <div className="flex flex-wrap gap-2">
            {VIEW_MODES.map((mode) => (
              <button
                key={mode.value}
                type="button"
                aria-pressed={viewMode === mode.value}
                onClick={() => setViewMode(mode.value)}
                className={
                  viewMode === mode.value
                    ? "schedule-control-button min-h-12 rounded-2xl bg-white px-5 text-base font-black text-black"
                    : "schedule-control-button min-h-12 rounded-2xl border border-white/10 bg-white/[0.03] px-5 text-base font-black text-white/72 transition hover:border-nzu-green/40 hover:text-white"
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
                      ? "schedule-filter-button min-h-11 rounded-2xl bg-nzu-green px-4 text-sm font-black text-black md:text-base"
                      : "schedule-filter-button min-h-11 rounded-2xl border border-white/10 bg-black/20 px-4 text-sm font-black text-white/68 transition hover:border-nzu-green/40 hover:text-white md:text-base"
                  }
                >
                  {filter.label}
                </button>
              ))}
            </div>
          ) : null}
        </div>

        {viewMode === "day" ? (
          <div className="text-sm font-black text-white/44 md:text-right md:text-base">{getRangeLabel(dayFilter)}</div>
        ) : null}
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
      <div className="rounded-[1.4rem] border border-dashed border-white/12 bg-white/[0.02] px-6 py-14 text-center">
        <p className="text-base font-medium text-white/60 md:text-lg">{emptyMessage}</p>
      </div>
    );
  }

  return (
    <div className="space-y-8">
      {groupedPosts.map(([date, datePosts]) => {
        const timedPosts = datePosts.filter((post) => post.schedule_start_time);
        const untimedPosts = datePosts.filter((post) => !post.schedule_start_time);

        return (
          <section key={date} className="space-y-4">
            <div className="schedule-date-pill sticky top-20 z-10 inline-flex rounded-full border border-white/10 bg-card/90 px-5 py-2.5 text-base font-black text-white shadow-sm backdrop-blur md:text-lg">
              {formatScheduleDate(date)}
            </div>
            <div className="space-y-4">
              {timedPosts.map((post) => (
                <ScheduleInfoCard key={post.id} post={post} />
              ))}
              {untimedPosts.length ? (
                <div className="pt-2">
                  <div className="mb-3 px-1 text-sm font-black text-white/58">시간 미정</div>
                  <div className="space-y-4">
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
  const calendarTitle = formatCalendarTitle(cursorKey, viewMode);
  const previousCalendarLabel = viewMode === "month" ? "이전 달" : "이전 주";
  const nextCalendarLabel = viewMode === "month" ? "다음 달" : "다음 주";

  return (
    <div className="space-y-5">
      <div className="schedule-calendar-toolbar flex flex-wrap items-center justify-between gap-4">
        <div className="flex min-w-0 flex-wrap items-center gap-3">
          <button
            type="button"
            aria-label={previousCalendarLabel}
            onClick={onPrevious}
            disabled={!canMovePrevious}
            className="schedule-calendar-nav-button schedule-control-button inline-flex h-12 w-12 items-center justify-center rounded-2xl border border-white/12 bg-white/[0.03] text-white transition hover:border-nzu-green/45 hover:text-nzu-green disabled:cursor-not-allowed disabled:opacity-35"
          >
            <ChevronLeft className="h-5 w-5" aria-hidden="true" />
            <span className="sr-only">이전</span>
          </button>
          <h2 className="schedule-calendar-title min-w-[8rem] text-xl font-black text-white md:min-w-[10rem] md:text-2xl">
            {calendarTitle}
          </h2>
          <button
            type="button"
            aria-label={nextCalendarLabel}
            onClick={onNext}
            disabled={!canMoveNext}
            className="schedule-calendar-nav-button schedule-control-button inline-flex h-12 w-12 items-center justify-center rounded-2xl border border-white/12 bg-white/[0.03] text-white transition hover:border-nzu-green/45 hover:text-nzu-green disabled:cursor-not-allowed disabled:opacity-35"
          >
            <ChevronRight className="h-5 w-5" aria-hidden="true" />
            <span className="sr-only">다음</span>
          </button>
          <button
            type="button"
            onClick={onToday}
            className="schedule-control-button inline-flex min-h-12 items-center rounded-2xl border border-white/12 bg-white/[0.03] px-5 text-base font-black text-white transition hover:border-nzu-green/45"
          >
            오늘
          </button>
        </div>
        <div className="text-sm font-black text-white/48">{visibleCount}건</div>
      </div>

      <div className="-mx-4 overflow-x-auto px-4 md:mx-0 md:px-0">
        <div className="schedule-calendar-grid min-w-[760px] overflow-hidden rounded-[1.25rem] border border-white/12 bg-[#07111f]">
          <div className="grid grid-cols-7 border-b border-white/12 bg-white/[0.05]">
            {WEEKDAY_LABELS.map((label, weekday) => (
              <div key={label} className={`px-3 py-4 text-center text-sm font-black ${getCalendarWeekdayClass(weekday)}`}>
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
                      ? "min-h-[9.5rem] border-b border-r border-sky-300/25 bg-sky-500/10 p-3"
                      : "min-h-[9.5rem] border-b border-r border-white/10 bg-white/[0.01] p-3"
                  }
                >
                  <div className="mb-2 flex items-center justify-between gap-2">
                    <span
                      className={
                        day.isToday
                          ? getCalendarTodayDateClass(day.weekday)
                          : `text-sm font-black ${getCalendarDateToneClass(day)}`
                      }
                    >
                      {day.dayLabel}
                    </span>
                    {dayPosts.length ? <span className="text-xs font-black text-sky-100/70">{dayPosts.length}</span> : null}
                  </div>

                  <div className="max-h-[8.25rem] space-y-2 overflow-y-auto pr-1">
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
        <div className="rounded-[1.25rem] border border-dashed border-white/12 bg-white/[0.02] px-6 py-10 text-center">
          <p className="text-base font-medium text-white/60">{emptyMessage}</p>
        </div>
      ) : null}
    </div>
  );
}

function ScheduleCalendarEvent({ post }: { post: BoardPostRow }) {
  return (
    <details className="group rounded-xl border border-white/8 bg-black/24 px-3 py-2 open:bg-black/40">
      <summary className="cursor-pointer marker:content-none">
        <div className="line-clamp-1 text-xs font-black leading-5 text-white">
          {post.schedule_start_time ? <span className="mr-1 text-nzu-green">{post.schedule_start_time.slice(0, 5)}</span> : null}
          {post.title}
        </div>
        <div className="line-clamp-1 text-[11px] font-bold text-white/52">{post.schedule_display_name}</div>
      </summary>
      <div className="mt-2 border-t border-white/8 pt-2">
        <ScheduleInfoBody post={post} compact />
      </div>
    </details>
  );
}

function ScheduleInfoCard({ post }: { post: BoardPostRow }) {
  return (
    <details className="schedule-info-card group overflow-hidden rounded-[1.25rem] border border-white/10 bg-card/60 transition hover:border-nzu-green/35">
      <summary className="grid cursor-pointer grid-cols-[5.75rem_minmax(0,1fr)_auto] items-center gap-4 px-5 py-4 marker:content-none md:px-6 md:py-5">
        <div className="flex min-h-[4.75rem] w-[5.25rem] flex-col items-center justify-center rounded-2xl border border-sky-300/45 bg-black/20 px-3 text-center">
          <strong className="max-w-full truncate text-base font-black text-white">{post.schedule_display_name}</strong>
          <span className="mt-1 text-xs font-black text-white/48">일정</span>
        </div>
        <div className="min-w-0">
          <div className="schedule-card-title truncate text-lg font-black leading-7 md:text-xl text-white">{post.title}</div>
          <div className="mt-3 flex flex-wrap items-center gap-2 text-sm font-bold text-white/56">
            <span className="rounded-full bg-sky-400/12 px-3 py-1.5 text-sky-100">정보/일정</span>
            <span>{formatTimeLabel(post.schedule_start_time)}</span>
          </div>
        </div>
        <span className="text-2xl text-white/42 transition group-open:rotate-180">⌄</span>
      </summary>
      <div className="border-t border-white/8 px-5 py-5 md:pl-[7.25rem]">
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
            ? "schedule-card-body max-w-none space-y-2 text-xs font-medium leading-6 text-white/72 md:text-sm [&_a]:font-bold [&_a]:text-nzu-green [&_p]:my-0"
            : "schedule-card-body max-w-none space-y-3 text-base font-medium leading-8 text-white/76 [&_a]:font-bold [&_a]:text-nzu-green [&_p]:my-0"
        }
        dangerouslySetInnerHTML={{ __html: renderedContent }}
      />
      <div className="mt-5 flex flex-wrap gap-2">
        {post.external_link_url ? (
          <a
            href={post.external_link_url}
            className="inline-flex min-h-11 items-center rounded-2xl bg-nzu-green px-5 text-sm font-black text-black"
            target="_blank"
            rel="noreferrer"
          >
            링크 열기
          </a>
        ) : null}
        <Link
          href={`/board/${post.id}`}
          className="inline-flex min-h-11 items-center rounded-2xl border border-white/12 bg-white/[0.04] px-5 text-sm font-black text-white"
        >
          게시글 자세히 보기
        </Link>
      </div>
    </>
  );
}
