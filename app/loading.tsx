
import { PlayerCardSkeleton } from "@/components/ui/Skeleton";
import { Skeleton } from "@/components/ui/Skeleton";

export default function Loading() {
  return (
    <div className="min-h-screen flex flex-col">
      <main className="flex-1">
        {/* 히어로 스켈레톤 */}
        <section className="max-w-6xl mx-auto px-4 py-16 text-center space-y-4">
           <Skeleton className="h-6 w-48 mx-auto rounded-full" />
           <Skeleton className="h-16 w-64 mx-auto" />
           <Skeleton className="h-4 w-80 mx-auto" />
        </section>

        {/* 그리드 스켈레톤 */}
        <section className="max-w-6xl mx-auto px-4 py-8">
          <Skeleton className="h-4 w-32 mb-6" />
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 gap-3">
            {[...Array(12)].map((_, i) => (
              <PlayerCardSkeleton key={i} />
            ))}
          </div>
        </section>
      </main>
    </div>
  );
}
