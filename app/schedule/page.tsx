import { ScheduleInfoList } from "@/components/schedule/ScheduleInfoList";
import { listScheduleInfoPosts } from "@/lib/board";

export const revalidate = 300;

export const metadata = {
  title: "HOSAGA - 일정",
  description: "호사가 HOSAGA 대회와 방송 정보/일정 안내",
};

function toKstDateKey(date: Date) {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Seoul",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(date);
}

function addDays(date: Date, days: number) {
  const next = new Date(date);
  next.setDate(next.getDate() + days);
  return next;
}

export default async function SchedulePage() {
  const today = new Date();
  const fromDate = toKstDateKey(today);
  const toDate = toKstDateKey(addDays(today, 60));
  const schedule = await listScheduleInfoPosts({ fromDate, toDate, limit: 100 });

  return (
    <div className="min-h-screen bg-background">
      <main className="mx-auto w-full max-w-5xl px-4 py-8 md:px-6 md:py-10">
        <h1 className="sr-only">일정</h1>
        <ScheduleInfoList posts={schedule.posts} todayKey={fromDate} />
      </main>
    </div>
  );
}
