
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
    <div className="relative w-full max-w-sm">
      <input
        type="text"
        placeholder="어떤 선수를 찾으시나요? (이름 입력)"
        onChange={(e) => handleSearch(e.target.value)}
        defaultValue={searchParams.get("search") || ""}
        className="w-full bg-[#1A221F] border border-white/10 rounded-xl px-5 py-3 text-sm text-white placeholder:text-white/30 focus:outline-none focus:border-nzu-green focus:bg-[#212B27] transition-all shadow-inner"
      />
      {isPending && (
        <div className="absolute right-4 top-3.5">
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
    <div className="flex items-center gap-2 bg-[#1A221F] p-1.5 rounded-xl border border-white/5 flex-nowrap min-w-max">
      {races.map((r) => {
        const isActive = currentRace === r.id;
        let activeClass = "bg-nzu-green text-white shadow-lg shadow-nzu-green/20";
        
        if (isActive) {
          if (r.id === 'T') activeClass = "bg-terran/20 text-terran border border-terran/30 shadow-lg shadow-terran/10";
          if (r.id === 'Z') activeClass = "bg-zerg/20 text-zerg border border-zerg/30 shadow-lg shadow-zerg/10";
          if (r.id === 'P') activeClass = "bg-protoss/20 text-protoss border border-protoss/30 shadow-lg shadow-protoss/10";
        }

        return (
          <button
            key={r.id}
            onClick={() => handleRace(r.id)}
            className={`
              px-6 py-2 rounded-lg text-sm font-black transition-all duration-200
              ${isActive 
                ? activeClass 
                : "text-white/40 hover:text-white hover:bg-white/5"
              }
            `}
          >
            {r.label}
          </button>
        );
      })}
    </div>
  );
}
