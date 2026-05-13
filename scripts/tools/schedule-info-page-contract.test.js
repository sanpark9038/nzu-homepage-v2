const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");

const repoRoot = path.resolve(__dirname, "..", "..");

function readProjectFile(filePath) {
  return fs.readFileSync(path.join(repoRoot, filePath), "utf8");
}

test("public schedule page uses schedule info board posts without a large hero", () => {
  const source = readProjectFile("app/schedule/page.tsx");

  assert.match(source, /listScheduleInfoPosts/);
  assert.match(source, /ScheduleInfoList/);
  assert.match(source, /addMonths/);
  assert.match(source, /Date\.UTC/);
  assert.match(source, /addMonthsToDateKey/);
  assert.match(source, /addDaysToDateKey/);
  assert.match(source, /minCalendarKey/);
  assert.match(source, /maxCalendarKey/);
  assert.match(source, /addDaysToDateKey\(addMonthsToDateKey\(todayKey,\s*-3\),\s*-6\)/);
  assert.match(source, /limit:\s*500/);
  assert.doesNotMatch(source, /addDays\(today,\s*60\)/);
  assert.doesNotMatch(source, /\.setDate\(/);
  assert.doesNotMatch(source, /\.setMonth\(/);
  assert.match(source, /<h1 className="sr-only">일정<\/h1>/);
  assert.doesNotMatch(source, /storageReady/);
  assert.doesNotMatch(source, /Match\s*<span/);
  assert.doesNotMatch(source, /Match Schedule/);
  assert.doesNotMatch(source, /공식 경기 일정 안내/);
  assert.doesNotMatch(source, /모든 일정 시간/);
  assert.doesNotMatch(source, /buildTournamentPredictionMatches/);
  assert.doesNotMatch(source, /loadPredictionState/);

  const boardSource = readProjectFile("lib/board.ts");
  assert.match(boardSource, /Math\.min\(Math\.max\(options\.limit \|\| 100,\s*1\),\s*500\)/);
});

test("visible navigation exposes schedule as short schedule label", () => {
  const source = readProjectFile("lib/navigation-config.ts");

  assert.match(source, /visibleNavbarLinks[\s\S]*href:\s*"\/schedule",\s*label:\s*"일정"/);
  assert.doesNotMatch(source, /hiddenNavbarLinks[\s\S]*href:\s*"\/schedule"/);
  assert.doesNotMatch(source, /label:\s*"대회일정"/);
});

test("schedule info list renders day week month controls with today as default", () => {
  const source = readProjectFile("components/schedule/ScheduleInfoList.tsx");

  assert.match(source, /"use client"/);
  assert.match(source, /todayKey/);
  assert.match(source, /viewMode/);
  assert.match(source, /dayFilter/);
  assert.match(source, /useState<ViewMode>\("day"\)/);
  assert.match(source, /useState<DayFilter>\("today"\)/);
  assert.match(source, /일별/);
  assert.match(source, /주별/);
  assert.match(source, /월별/);
  assert.match(source, /오늘/);
  assert.match(source, /내일/);
  assert.match(source, /모레/);
  assert.match(source, /시간 미정/);
  assert.match(source, /정보\/일정/);
  assert.match(source, /예정된 경기가 없습니다/);
  assert.match(source, /details/);
  assert.match(source, /summary/);
  assert.match(source, /aria-pressed/);
  assert.doesNotMatch(source, /if \(!posts\.length\)/);
  assert.doesNotMatch(source, /iframe/);
  assert.doesNotMatch(source, /<img/);
});

test("schedule info list renders weekly and monthly calendar grids", () => {
  const source = readProjectFile("components/schedule/ScheduleInfoList.tsx");

  assert.match(source, /WEEKDAY_LABELS/);
  assert.match(source, /buildWeekCalendarDays/);
  assert.match(source, /buildMonthCalendarDays/);
  assert.match(source, /ScheduleCalendarView/);
  assert.match(source, /schedule-calendar-grid/);
  assert.match(source, /grid-cols-7/);
  assert.match(source, /Date\.UTC/);
  assert.match(source, /getUTCDay/);
  assert.match(source, /getUTCDate/);
  assert.match(source, /setUTCDate/);
  assert.match(source, /dayFilter === "all"\) return scheduleDate >= todayKey/);
  assert.match(source, /isCalendarRangeWithinBounds/);
  assert.match(source, /firstDateKey/);
  assert.match(source, /lastDateKey/);
  assert.doesNotMatch(source, /\.getDay\(/);
  assert.doesNotMatch(source, /\.getDate\(/);
  assert.doesNotMatch(source, /\.getMonth\(/);
  assert.doesNotMatch(source, /\.setDate\(/);
  assert.doesNotMatch(source, /\.setMonth\(/);
  assert.match(source, /canMovePrevious/);
  assert.match(source, /canMoveNext/);
  assert.match(source, /disabled={!canMovePrevious}/);
  assert.match(source, /disabled={!canMoveNext}/);
  assert.match(source, /이전/);
  assert.match(source, /다음/);
  assert.match(source, /isToday/);
  assert.match(source, /isCurrentMonth/);
  assert.match(source, /line-clamp-1/);
  assert.match(source, /viewMode === "day"/);
  assert.match(source, /viewMode !== "day"/);
});
