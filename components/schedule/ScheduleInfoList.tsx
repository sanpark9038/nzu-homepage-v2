"use client";

import Link from "next/link";
import { ChevronLeft, ChevronRight, X } from "lucide-react";
import { useEffect, useMemo, useState } from "react";

import type { BoardPostRow } from "@/lib/board";
import { renderBoardContentToHtml } from "@/lib/board-content";

type ScheduleInfoListProps = {
  posts: BoardPostRow[];
  todayKey: string;
  minCalendarKey: string;
  maxCalendarKey: string;
};

type ViewMode = "day" | "week" | "month";
type DayFilter = "today" | "tomorrow" | "dayAfterTomorrow";

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

function formatSelectedScheduleDate(value: string) {
  const date = dateFromKey(value);
  return new Intl.DateTimeFormat("ko-KR", {
    year: "numeric",
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
  return "모레 등록된 일정이 없습니다.";
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

function getCalendarDayButtonClass(day: CalendarDay, hasPosts: boolean) {
  const toneClass = day.isToday ? getCalendarTodayDateClass(day.weekday) : `rounded-full text-sm font-black ${getCalendarDateToneClass(day)}`;
  const interactionClass = hasPosts
    ? "schedule-calendar-day-button cursor-pointer transition hover:ring-2 hover:ring-nzu-green/55 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-nzu-green/70"
    : "schedule-calendar-day-button cursor-default disabled:opacity-100";
  return `${toneClass} ${interactionClass}`;
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
      <div className="schedule-filter-toolbar flex flex-col gap-4 border-b border-white/8 pb-6 md:flex-row md:items-end md:justify-between">
        <div className="space-y-3">
          <div className="schedule-view-segment inline-flex flex-wrap gap-1 rounded-full border border-white/10 bg-white/[0.035] p-1">
            {VIEW_MODES.map((mode) => (
              <button
                key={mode.value}
                type="button"
                aria-pressed={viewMode === mode.value}
                onClick={() => setViewMode(mode.value)}
                className={
                  viewMode === mode.value
                    ? "schedule-control-button min-h-11 rounded-full bg-nzu-green px-5 text-base font-black text-black shadow-sm shadow-nzu-green/10"
                    : "schedule-control-button min-h-11 rounded-full px-5 text-base font-black text-white/72 transition hover:bg-white/[0.06] hover:text-white"
                }
              >
                {mode.label}
              </button>
            ))}
          </div>

          {viewMode === "day" ? (
            <div className="schedule-date-filter-bar inline-flex flex-wrap gap-1 rounded-full border border-white/10 bg-white/[0.025] p-1">
              {DAY_FILTERS.map((filter) => (
                <button
                  key={filter.value}
                  type="button"
                  aria-pressed={dayFilter === filter.value}
                  onClick={() => setDayFilter(filter.value)}
                  className={
                    dayFilter === filter.value
                      ? "schedule-filter-button min-h-10 rounded-full bg-nzu-green px-4 text-sm font-black text-black md:text-base"
                      : "schedule-filter-button min-h-10 rounded-full bg-white/[0.04] px-4 text-sm font-black text-white/74 transition hover:bg-white/[0.07] hover:text-white md:text-base"
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
  const [selectedCalendarDateKey, setSelectedCalendarDateKey] = useState<string | null>(null);
  const days = getCalendarDaysForView(viewMode, cursorKey, todayKey);
  const visibleCount = days.reduce((count, day) => count + (postsByDate.get(day.dateKey)?.length || 0), 0);
  const emptyMessage = getCalendarEmptyMessage(posts, visibleCount);
  const selectedCalendarPosts = selectedCalendarDateKey ? postsByDate.get(selectedCalendarDateKey) || [] : [];
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

  useEffect(() => {
    if (!selectedCalendarDateKey) return;

    function handleKeydown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        setSelectedCalendarDateKey(null);
      }
    }

    window.addEventListener("keydown", handleKeydown);
    return () => window.removeEventListener("keydown", handleKeydown);
  }, [selectedCalendarDateKey]);

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
                      className="inline-flex"
                    >
                      <button
                        type="button"
                        aria-label={`${formatSelectedScheduleDate(day.dateKey)} 일정 보기`}
                        disabled={!dayPosts.length}
                        onClick={() => setSelectedCalendarDateKey(day.dateKey)}
                        className={getCalendarDayButtonClass(day, Boolean(dayPosts.length))}
                      >
                        {day.dayLabel}
                      </button>
                    </span>
                        {dayPosts.length ? (
                          <span className="schedule-calendar-count-pill rounded-full border border-sky-300/14 bg-sky-300/8 px-2 py-0.5 text-[10px] font-black text-sky-100/68">
                            {dayPosts.length}일정
                          </span>
                        ) : null}
                  </div>

                  <div className="max-h-[8.25rem] space-y-2 overflow-y-auto pr-1">
                    {dayPosts.map((post) => (
                      <ScheduleCalendarEvent key={post.id} post={post} onSelect={() => setSelectedCalendarDateKey(day.dateKey)} />
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

      {selectedCalendarDateKey && selectedCalendarPosts.length ? (
        <ScheduleCalendarDayDialog
          dateKey={selectedCalendarDateKey}
          posts={selectedCalendarPosts}
          onClose={() => setSelectedCalendarDateKey(null)}
        />
      ) : null}
    </div>
  );
}

function ScheduleCalendarDayDialog({
  dateKey,
  posts,
  onClose,
}: {
  dateKey: string;
  posts: BoardPostRow[];
  onClose: () => void;
}) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/65 px-4 py-8 backdrop-blur-sm" onClick={onClose}>
      <section
        role="dialog"
        aria-modal="true"
        aria-labelledby="schedule-day-dialog-title"
        className="w-full max-w-3xl rounded-[1.25rem] border border-white/10 bg-[#101820] p-6 shadow-2xl shadow-black/40 md:p-7"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="flex items-start justify-between gap-4 border-b border-white/10 pb-5">
          <div>
            <h2 id="schedule-day-dialog-title" className="text-xl font-black text-white md:text-2xl">
              {formatSelectedScheduleDate(dateKey)}
            </h2>
            <p className="mt-2 text-sm font-bold text-white/50">{posts.length}개의 일정</p>
          </div>
          <button
            type="button"
            aria-label="닫기"
            onClick={onClose}
            className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-full border border-sky-300/35 bg-white/[0.03] text-sky-200 transition hover:border-sky-300 hover:text-white"
          >
            <X className="h-5 w-5" aria-hidden="true" />
          </button>
        </div>

        <div className="mt-5 max-h-[65vh] space-y-3 overflow-y-auto pr-1">
          {posts.map((post) => (
            <ScheduleInfoCard key={post.id} post={post} />
          ))}
        </div>
      </section>
    </div>
  );
}

function ScheduleCalendarEvent({ post, onSelect }: { post: BoardPostRow; onSelect: () => void }) {
  const scheduleDateLabel = post.schedule_date ? formatSelectedScheduleDate(post.schedule_date) : "";
  const timeLabel = formatTimeLabel(post.schedule_start_time);

  return (
    <button
      type="button"
      aria-label={scheduleDateLabel ? `${post.title} ${scheduleDateLabel} 일정 보기` : `${post.title} 일정 보기`}
      onClick={onSelect}
      className="schedule-calendar-event-button group flex flex-col items-start min-h-[4.6rem] w-full gap-1 rounded-xl border border-white/9 bg-black/28 px-2.5 py-2 text-left shadow-[inset_0_1px_0_rgba(255,255,255,0.03)] transition hover:border-nzu-green/45 hover:bg-black/44 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-nzu-green/70"
    >
      <span className="schedule-calendar-event-time-badge inline-flex h-5 items-center justify-center rounded-md border border-nzu-green/22 bg-nzu-green/12 px-2 text-[10px] font-black leading-none text-nzu-green">
        {post.schedule_start_time ? post.schedule_start_time.slice(0, 5) : "미정"}
      </span>
      <span className="schedule-calendar-event-title line-clamp-1 w-full min-w-0 truncate text-[12px] font-black leading-5 text-white">
        {post.title}
      </span>
      <span className="schedule-calendar-event-subtitle line-clamp-1 w-full min-w-0 truncate text-[11px] font-bold leading-4 text-white/56">
        {post.schedule_display_name || timeLabel}
      </span>
    </button>
  );
}

function ScheduleInfoCard({ post }: { post: BoardPostRow }) {
  return (
    <details className="schedule-info-card group overflow-hidden rounded-[1.25rem] border border-white/10 bg-card/60 transition hover:border-nzu-green/35">
      <summary className="flex cursor-pointer flex-col gap-3 px-5 py-4 marker:content-none md:flex-row md:items-center md:gap-4 md:px-6 md:py-5">
        <div className="min-w-0 flex-1">
          <div className="mb-2 flex flex-wrap items-center gap-2">
            <span className="schedule-card-meta-badge max-w-full truncate rounded-full border border-nzu-green/24 bg-nzu-green/10 px-3 py-1 text-xs font-black text-nzu-green">
              {post.schedule_display_name}
            </span>
            <span className="schedule-card-meta-badge rounded-full border border-sky-300/18 bg-sky-400/10 px-3 py-1 text-xs font-black text-sky-100">
              정보/일정
            </span>
            <span className="schedule-card-meta-badge rounded-full border border-white/10 bg-white/[0.04] px-3 py-1 text-xs font-black text-white/64">
              {formatTimeLabel(post.schedule_start_time)}
            </span>
          </div>
          <div className="schedule-card-title truncate text-lg font-black leading-7 md:text-xl text-white">{post.title}</div>
        </div>
        <span className="self-end text-2xl text-white/42 transition group-open:rotate-180 md:self-auto">⌄</span>
      </summary>
      <div className="border-t border-white/8 px-5 py-5 md:px-6">
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
