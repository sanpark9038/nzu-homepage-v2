import { Skeleton } from "@/components/ui/Skeleton";
import { cn } from "@/lib/utils";

type PublicRouteLoadingVariant = "cards" | "search" | "calendar";

export function PublicRouteLoading({
  maxWidth = "max-w-6xl",
  variant = "cards",
}: {
  maxWidth?: string;
  variant?: PublicRouteLoadingVariant;
}) {
  return (
    <div className="min-h-screen bg-background text-foreground" aria-label="Loading" role="status">
      <main className={cn("mx-auto flex w-full flex-col gap-5 px-4 py-8 md:px-8", maxWidth)}>
        <section className="rounded-[1.4rem] border border-white/8 bg-[linear-gradient(180deg,rgba(10,16,18,0.98),rgba(7,10,11,0.94))] p-5 shadow-[0_18px_54px_rgba(0,0,0,0.18)]">
          <Skeleton className="h-3 w-24" />
          <Skeleton className="mt-4 h-9 w-56 max-w-full" />
          <Skeleton className="mt-3 h-4 w-full max-w-2xl" />
          <Skeleton className="mt-2 h-4 w-3/4 max-w-xl" />
        </section>

        {variant === "search" ? <SearchLoadingPanel /> : null}
        {variant === "calendar" ? <CalendarLoadingPanel /> : null}
        {variant === "cards" ? <CardLoadingGrid /> : null}
      </main>
    </div>
  );
}

function SearchLoadingPanel() {
  return (
    <section className="rounded-[2rem] border border-white/8 bg-[linear-gradient(180deg,rgba(8,17,18,0.94),rgba(6,10,11,0.92))] px-5 py-5 shadow-[0_24px_80px_rgba(0,0,0,0.34)] md:px-7">
      <div className="mx-auto max-w-3xl">
        <Skeleton className="mx-auto h-9 w-60 max-w-full" />
        <Skeleton className="mx-auto mt-3 h-4 w-full max-w-xl" />
        <div className="mt-6 rounded-[1.25rem] border border-white/8 bg-white/[0.03] p-3">
          <Skeleton className="h-12 w-full rounded-[1rem]" />
        </div>
      </div>
    </section>
  );
}

function CalendarLoadingPanel() {
  return (
    <section className="grid gap-4 rounded-[1.5rem] border border-white/8 bg-white/[0.025] p-4 md:grid-cols-[280px_minmax(0,1fr)]">
      <div className="space-y-3">
        {Array.from({ length: 5 }).map((_, index) => (
          <Skeleton key={index} className="h-14 w-full rounded-xl" />
        ))}
      </div>
      <div className="grid grid-cols-7 gap-2">
        {Array.from({ length: 35 }).map((_, index) => (
          <Skeleton key={index} className="aspect-square w-full rounded-xl" />
        ))}
      </div>
    </section>
  );
}

function CardLoadingGrid() {
  return (
    <section className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
      {Array.from({ length: 8 }).map((_, index) => (
        <div key={index} className="rounded-[1.35rem] border border-white/8 bg-white/[0.025] p-4">
          <Skeleton className="aspect-[4/3] w-full rounded-xl" />
          <Skeleton className="mt-4 h-5 w-2/3" />
          <Skeleton className="mt-2 h-4 w-1/2" />
        </div>
      ))}
    </section>
  );
}
