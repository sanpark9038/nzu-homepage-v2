import { Skeleton } from "@/components/ui/Skeleton";

export default function Loading() {
  return (
    <main className="min-h-[calc(100vh-4rem)] bg-background px-4 py-4 text-foreground md:px-8 xl:px-10">
      <div className="mx-auto flex max-w-[96rem] flex-col items-center pt-4 md:pt-5">
        <section className="w-full max-w-6xl overflow-hidden rounded-2xl border border-white/8 bg-card px-5 py-4 shadow-[0_8px_32px_rgba(0,0,0,0.28)] md:overflow-visible md:px-7 md:py-5 xl:max-w-[84rem] xl:px-8">
          <Skeleton className="h-3.5 w-24 mb-4" />
          <div className="text-center">
            <Skeleton className="mx-auto h-9 w-52 max-w-full" />
            <Skeleton className="mx-auto mt-3 h-4 w-full max-w-xl" />
          </div>
          <div className="mt-5 rounded-[1.25rem] border border-white/8 bg-white/[0.03] p-3">
            <Skeleton className="h-12 w-full rounded-[1rem]" />
          </div>
          <div className="mt-4 space-y-4">
            <div className="flex items-center gap-3 rounded-2xl border border-white/8 bg-white/[0.025] px-5 py-4">
              <div className="h-3.5 w-3.5 shrink-0 animate-spin rounded-full border-2 border-white/10 border-t-nzu-green" />
              <span className="text-sm font-medium text-white/45">선수 정보를 불러오는 중...</span>
            </div>
            <div className="rounded-2xl border border-white/8 bg-white/[0.025] p-5">
              <div className="grid gap-5 md:grid-cols-[124px_minmax(0,1fr)_240px]">
                <Skeleton className="h-[124px] w-full rounded-xl" />
                <div className="space-y-3 py-1">
                  <Skeleton className="h-3 w-14" />
                  <Skeleton className="h-7 w-48" />
                  <div className="flex gap-2 pt-1">
                    <Skeleton className="h-5 w-14 rounded-full" />
                    <Skeleton className="h-5 w-20 rounded-full" />
                    <Skeleton className="h-5 w-16 rounded-full" />
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-2">
                  <Skeleton className="h-[72px] rounded-xl" />
                  <Skeleton className="h-[72px] rounded-xl" />
                  <Skeleton className="h-[72px] rounded-xl" />
                  <Skeleton className="h-[72px] rounded-xl" />
                </div>
              </div>
            </div>
          </div>
        </section>
      </div>
    </main>
  );
}
