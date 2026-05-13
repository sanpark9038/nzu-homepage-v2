import { ScheduleInfoList } from "@/components/schedule/ScheduleInfoList";
import { listScheduleInfoPosts } from "@/lib/board";

export const revalidate = 300;

export const metadata = {
  title: "HOSAGA - 대회일정",
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
      <main className="mx-auto w-full max-w-4xl px-4 py-12 md:px-6 md:py-16">
        <header className="mb-10">
          <h1 className="text-4xl font-black tracking-tighter text-white md:text-5xl">
            Match <span className="gradient-text">Schedule</span>
          </h1>
          <p className="mt-3 text-sm font-medium leading-7 text-muted-foreground">공식 경기 일정 안내</p>
        </header>

        <ScheduleInfoList posts={schedule.posts} todayKey={fromDate} />

        <footer className="mt-16 border-t border-border/10 pt-8 text-center">
          <p className="text-[10px] font-black uppercase tracking-[0.2em] text-muted-foreground/40">
            모든 일정 시간은 한국(KST) 기준이며, 현장 상황에 따라 변경될 수 있습니다.
          </p>
        </footer>
      </main>
    </div>
  );
}
