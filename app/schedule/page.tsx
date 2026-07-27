import { ScheduleInfoList } from "@/components/schedule/ScheduleInfoList";
import { listScheduleInfoPosts } from "@/lib/board";

export const revalidate = 300;

export const metadata = {
  title: "스타 대학대전 경기 일정",
  description:
    "숲 스타크래프트 대학대전의 경기와 방송 일정을 달력으로 봅니다. 날짜별로 어떤 대학이 언제 붙는지 확인할 수 있습니다.",
  keywords: ["스타 대학대전 일정", "스타 대학리그 일정", "숲 스타크래프트 대학대전", "스타호사가"],
  alternates: { canonical: "/schedule" },
  openGraph: {
    title: "스타 대학대전 경기 일정",
    description: "숲 스타크래프트 대학대전의 경기와 방송 일정을 달력으로 확인",
    url: "/schedule",
    type: "website",
  },
};

function toKstDateKey(date: Date) {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Seoul",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(date);
}

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

export default async function SchedulePage() {
  const today = new Date();
  const todayKey = toKstDateKey(today);
  const minCalendarKey = addDaysToDateKey(addMonthsToDateKey(todayKey, -3), -6);
  const maxCalendarKey = addDaysToDateKey(addMonthsToDateKey(todayKey, 14), 6);
  const schedule = await listScheduleInfoPosts({ fromDate: minCalendarKey, toDate: maxCalendarKey, limit: 500 });

  return (
    <div className="min-h-screen bg-background">
      <main className="mx-auto w-full max-w-5xl px-4 py-8 md:px-6 md:py-10">
        <h1 className="sr-only">일정</h1>
        <ScheduleInfoList
          posts={schedule.posts}
          todayKey={todayKey}
          minCalendarKey={minCalendarKey}
          maxCalendarKey={maxCalendarKey}
        />
      </main>
    </div>
  );
}
