
import Navbar from "@/components/Navbar";
import { Skeleton } from "@/components/ui/Skeleton";

export default function LiveLoading() {
  return (
    <div className="min-h-screen flex flex-col bg-[#0A0F0D]">
      <Navbar />
      <main className="flex-1 max-w-6xl mx-auto w-full px-4 py-8">
        <div className="mb-10 space-y-4">
          <Skeleton className="h-4 w-32" />
          <Skeleton className="h-12 w-64" />
          <Skeleton className="h-4 w-80" />
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
          {[...Array(6)].map((_, i) => (
            <div key={i} className="bg-card border border-border/40 rounded-2xl overflow-hidden h-[240px]">
               <Skeleton className="h-[140px] w-full" />
               <div className="p-4 flex items-center gap-3">
                  <Skeleton className="h-10 w-10 rounded-full" />
                  <div className="space-y-2 flex-1">
                     <Skeleton className="h-4 w-2/3" />
                     <Skeleton className="h-3 w-1/3" />
                  </div>
               </div>
            </div>
          ))}
        </div>
      </main>
    </div>
  );
}
