import { PointsClient } from "@/components/points/PointsClient";

export const metadata = {
  title: "포인트",
  description: "출석 체크로 포인트를 모으고 랭킹을 확인하세요.",
  alternates: { canonical: "/points" },
};

export default function PointsPage() {
  return (
    <div className="min-h-screen bg-background text-foreground">
      <main className="mx-auto flex w-full max-w-[900px] flex-col px-4 py-4 md:py-8 lg:px-8">
        <section className="hosaga-card mb-3 px-4 py-3 md:mb-4 md:px-5 md:py-4">
          <div className="ui-label hidden uppercase text-nzu-green md:block">Points</div>
          <h1 className="text-xl font-bold text-white md:mt-2 md:text-3xl">포인트</h1>
          <p className="mt-1.5 hidden text-sm font-medium text-white/55 md:block">
            매일 출석 체크로 포인트를 모을 수 있습니다.
          </p>
        </section>

        <PointsClient />
      </main>
    </div>
  );
}
