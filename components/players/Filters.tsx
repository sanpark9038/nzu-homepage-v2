
"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { useCallback, useTransition } from "react";

export function PlayerSearch() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [isPending, startTransition] = useTransition();

  const handleSearch = useCallback((term: string) => {
    const params = new URLSearchParams(searchParams);
    if (term) {
      params.set("search", term);
    } else {
      params.delete("search");
    }
    
    startTransition(() => {
      router.push(`?${params.toString()}`, { scroll: false });
    });
  }, [router, searchParams]);

  return (
    <div className="relative w-full max-w-xs">
      <input
        type="text"
        placeholder="선수 이름 검색..."
        onChange={(e) => handleSearch(e.target.value)}
        defaultValue={searchParams.get("search") || ""}
        className="w-full bg-card border border-border rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-nzu-green/50 transition-all"
      />
      {isPending && (
        <div className="absolute right-3 top-2.5">
           <div className="w-4 h-4 border-2 border-nzu-green/20 border-t-nzu-green rounded-full animate-spin" />
        </div>
      )}
    </div>
  );
}

export function RaceFilter() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const currentRace = searchParams.get("race") || "ALL";

  const handleRace = (race: string) => {
    const params = new URLSearchParams(searchParams);
    if (race === "ALL") {
      params.delete("race");
    } else {
      params.set("race", race);
    }
    router.push(`?${params.toString()}`, { scroll: false });
  };

  const races = [
    { id: "ALL", label: "전체" },
    { id: "T", label: "테란" },
    { id: "Z", label: "저그" },
    { id: "P", label: "토스" },
  ];

  return (
    <div className="flex items-center gap-1 bg-muted/20 p-1 rounded-lg border border-border/40">
      {races.map((r) => (
        <button
          key={r.id}
          onClick={() => handleRace(r.id)}
          className={`
            px-3 py-1 rounded-md text-[10px] font-bold transition-all
            ${currentRace === r.id 
              ? "bg-nzu-green text-white shadow-sm" 
              : "text-muted-foreground hover:text-foreground"
            }
          `}
        >
          {r.label}
        </button>
      ))}
    </div>
  );
}
