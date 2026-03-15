
import { cn } from "@/lib/utils";

interface SkeletonProps {
  className?: string;
}

export function Skeleton({ className }: SkeletonProps) {
  return (
    <div
      className={cn(
        "animate-pulse rounded-md bg-muted/20",
        className
      )}
    />
  );
}

export function PlayerCardSkeleton() {
  return (
    <div className="flex flex-col gap-2 p-3 bg-card border border-border rounded-xl">
      <Skeleton className="aspect-square w-full rounded-lg" />
      <div className="flex items-center justify-between">
        <Skeleton className="h-4 w-1/2" />
        <Skeleton className="h-3 w-4" />
      </div>
      <Skeleton className="h-3 w-1/3" />
      <Skeleton className="h-2 w-full mt-1" />
    </div>
  );
}

export function PlayerRowSkeleton() {
  return (
    <div className="grid grid-cols-[3rem_2fr_1fr_1fr_1fr] items-center px-4 py-3 border-b border-border/40">
      <Skeleton className="h-3 w-4 mx-auto" />
      <div className="flex items-center gap-3">
        <Skeleton className="h-8 w-8 rounded-full" />
        <div className="space-y-1">
          <Skeleton className="h-3 w-20" />
          <Skeleton className="h-2 w-12" />
        </div>
      </div>
      <Skeleton className="h-1.5 w-16 mx-auto" />
      <Skeleton className="h-3 w-10 mx-auto" />
      <Skeleton className="h-5 w-12 ml-auto" />
    </div>
  );
}
