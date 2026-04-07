
"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { useCallback, useTransition } from "react";
import { cn } from "@/lib/utils";
import { UNIVERSITY_MAP } from "@/lib/university-config";
import { TIERS } from "@/lib/constants";
import { ChevronDown, School, Shield } from "lucide-react";

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
    <div className="relative group w-full md:w-64">
      <div className="absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none text-white/20 group-focus-within:text-nzu-green transition-colors">
        <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><circle cx="11" cy="11" r="8"/><path d="m21 21-4.3-4.3"/></svg>
      </div>
      <input
        type="text"
        placeholder="선수 검색..."
        defaultValue={searchParams.get("search") || ""}
        onChange={(e) => handleSearch(e.target.value)}
        className="w-full bg-white/5 border border-white/10 rounded-md py-2 pl-9 pr-4 text-[11px] font-bold text-white placeholder:text-white/10 focus:outline-none focus:border-nzu-green/40 focus:bg-white/10 transition-all uppercase tracking-wider"
      />
      {isPending && (
        <div className="absolute right-3 top-1/2 -translate-y-1/2">
           <div className="w-3 h-3 border-2 border-nzu-green/20 border-t-nzu-green rounded-full animate-spin" />
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
    { id: "T",   label: "테란" },
    { id: "Z",   label: "저그" },
    { id: "P",   label: "토스" },
  ];

  const getRaceGradient = (raceId: string) => {
    switch (raceId) {
      case "T":   return "bg-gradient-to-br from-blue-600 to-blue-400 text-white shadow-lg shadow-blue-500/20";
      case "Z":   return "bg-gradient-to-br from-purple-600 to-purple-400 text-white shadow-lg shadow-purple-500/20";
      case "P":   return "bg-gradient-to-br from-yellow-500 to-yellow-300 text-black shadow-lg shadow-yellow-500/10";
      default:    return "bg-nzu-green text-black shadow-lg shadow-nzu-green/20";
    }
  };

  return (
    <div className="flex items-center bg-white/5 border border-white/10 rounded-lg p-1 gap-1">
      {races.map((r) => {
        const isActive = currentRace === r.id;
        return (
          <button
            key={r.id}
            onClick={() => handleRace(r.id)}
            className={cn(
              "px-4 py-2 rounded-md text-xs font-bold transition-all tracking-tight min-w-[64px] flex items-center justify-center",
              isActive 
                ? getRaceGradient(r.id)
                : "text-white/30 hover:text-white hover:bg-white/5"
            )}
          >
            {r.label}
          </button>
        );
      })}
    </div>
  );
}

export function UnivFilter() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const currentUniv = searchParams.get("univ") || "ALL";

  const handleUniv = (univ: string) => {
    const params = new URLSearchParams(searchParams);
    // [Toggle Logic] 같은 버튼 누르면 해제
    if (currentUniv === univ || univ === "ALL") {
      params.delete("univ");
    } else {
      params.set("univ", univ);
    }
    router.push(`?${params.toString()}`, { scroll: false });
  };

  const getSortedUnivs = () => {
    const keys = Object.keys(UNIVERSITY_MAP);
    
    return keys.sort((a, b) => {
      if (a === 'NZU') return -1;
      if (b === 'NZU') return 1;
      if (a === 'FA') return 1;
      if (b === 'FA') return -1;

      const nameA = UNIVERSITY_MAP[a].name;
      const nameB = UNIVERSITY_MAP[b].name;

      // 한글 여부 체크 (가나다 순 우선)
      const isKoA = /[ㄱ-ㅎ|ㅏ-ㅣ|가-힣]/.test(nameA);
      const isKoB = /[ㄱ-ㅎ|ㅏ-ㅣ|가-힣]/.test(nameB);

      if (isKoA && !isKoB) return -1;
      if (!isKoA && isKoB) return 1;

      return nameA.localeCompare(nameB, 'ko');
    });
  };

  const sortedKeys = getSortedUnivs();

  return (
    <div className="flex flex-wrap items-center gap-4 bg-white/[0.03] p-4 rounded-3xl border border-white/10 backdrop-blur-sm">
      <button
        onClick={() => handleUniv("ALL")}
        className={cn(
          "px-8 py-4 rounded-2xl text-sm font-black transition-all border border-transparent whitespace-nowrap",
          currentUniv === "ALL"
            ? "bg-white text-black shadow-[0_0_20px_rgba(255,255,255,0.3)] scale-105"
            : "bg-white/5 text-white/40 hover:bg-white/10 hover:text-white"
        )}
      >
        전체 대학
      </button>

      {sortedKeys.map((key) => {
        const u = UNIVERSITY_MAP[key];
        const isActive = currentUniv === key;
        const starCount = u.stars || 0;

        return (
          <button
            key={key}
            onClick={() => handleUniv(key)}
            className={cn(
              "relative px-8 py-4 rounded-2xl text-sm font-black transition-all border border-transparent whitespace-nowrap group",
              isActive 
                ? "bg-gradient-to-br from-nzu-green/80 to-nzu-green text-black shadow-[0_0_25px_rgba(46,213,115,0.4)] border-white/20 scale-105"
                : "bg-white/5 text-white/40 hover:bg-white/10 hover:text-white"
            )}
          >
            {/* --- Stars (우승 횟수) --- */}
            {starCount > 0 && (
              <div className="absolute -top-2 left-1/2 -translate-x-1/2 flex gap-0.5">
                {[...Array(starCount)].map((_, i) => (
                  <span 
                    key={i} 
                    className={cn(
                      "text-yellow-400 text-[14px] drop-shadow-[0_0_5px_rgba(250,204,21,0.8)]",
                      key === 'C9' && "animate-pulse"
                    )}
                  >
                    ★
                  </span>
                ))}
              </div>
            )}
            {u.name}
          </button>
        );
      })}
    </div>
  );
}

export function TierFilter() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const currentTier = searchParams.get("tier") || "ALL";

  const handleTier = (tier: string) => {
    const params = new URLSearchParams(searchParams);
    // [Toggle Logic] 같은 버튼 누르면 해제
    if (currentTier === tier || tier === "ALL") {
      params.delete("tier");
    } else {
      params.set("tier", tier);
    }
    router.push(`?${params.toString()}`, { scroll: false });
  };

  const tierShortLabels: Record<string, string> = {
    "GOD": "갓",
    "KING": "킹",
    "JACK": "잭",
    "QUEEN": "퀸",
    "JOKER": "조커",
    "스페이드": "스",
    "BABY": "베",
    "RESET": "초기화"
  };

  const tiers = [
    ...TIERS.filter(t => t !== '미정').map(t => ({ 
      id: t, 
      label: tierShortLabels[t as string] || t 
    }))
  ];

  return (
    <div className="flex flex-col gap-6 w-full pt-4">
      {/* --- Tier Buttons (Big Capsule Style) --- */}
      <div className="flex flex-wrap items-center gap-3 bg-white/[0.03] p-3 rounded-full border border-white/10 backdrop-blur-sm">
        {tiers.map((t) => {
          const isActive = currentTier === t.id;
          return (
            <button
              key={t.id}
              onClick={() => handleTier(t.id)}
              className={cn(
                "w-14 h-14 rounded-full flex items-center justify-center text-[13px] font-black transition-all border border-transparent",
                isActive 
                  ? "bg-gradient-to-br from-purple-600 to-purple-400 text-white shadow-[0_0_20px_rgba(168,85,247,0.5)] border-white/20 scale-110"
                  : "bg-white/5 text-white/40 hover:bg-white/10 hover:text-white"
              )}
            >
              {t.label}
            </button>
          );
        })}
        <button
          onClick={() => handleTier("ALL")}
          className="px-8 h-14 rounded-full bg-red-500/80 hover:bg-red-500 text-white text-xs font-black uppercase transition-all shadow-[0_0_20px_rgba(239,68,68,0.3)] hover:scale-105"
        >
          초기화
        </button>
      </div>

      {/* --- Utility Controls (Live, Refresh) --- */}
      <div className="flex items-center gap-6">
        <div className="flex items-center gap-4">
          <span className="text-xs font-black text-white/40 uppercase tracking-widest">방송 중</span>
          <label className="relative inline-flex items-center cursor-pointer">
            <input type="checkbox" className="sr-only peer" />
            <div className="w-14 h-7 bg-white/10 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-6 after:w-6 after:transition-all peer-checked:bg-blue-600 shadow-inner"></div>
          </label>
        </div>

        <button className="px-8 py-3.5 bg-nzu-green/80 hover:bg-nzu-green text-black text-xs font-black rounded-full transition-all shadow-[0_0_20px_rgba(46,213,115,0.3)] hover:scale-105">
          새로고침
        </button>

        <div className="flex-1 h-px bg-white/10" />
        
        <span className="text-xs font-black text-white/20 uppercase tracking-widest">티어표 출처: NZU ARCHIVE</span>
      </div>
    </div>
  );
}

export function RaceToggle() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const isToggled = searchParams.get("raceToggle") === "true";

  const handleToggle = () => {
    const params = new URLSearchParams(searchParams);
    if (isToggled) {
      params.delete("raceToggle");
    } else {
      params.set("raceToggle", "true");
    }
    router.push(`?${params.toString()}`, { scroll: false });
  };

  return (
    <div className="flex items-center gap-4 bg-white/[0.03] px-6 py-3 rounded-2xl border border-white/10 backdrop-blur-sm">
      <span className="text-sm font-black text-white/60 uppercase tracking-widest transition-colors mb-0.5">
        종족 구분
      </span>
      <button 
        onClick={handleToggle}
        className={cn(
          "relative inline-flex items-center h-7 w-14 rounded-full transition-all duration-300 focus:outline-none shadow-inner",
          isToggled ? "bg-nzu-green" : "bg-white/10"
        )}
      >
        <span
          className={cn(
            "inline-block w-5 h-5 transform bg-white rounded-full transition-transform duration-300 shadow-lg",
            isToggled ? "translate-x-8" : "translate-x-1"
          )}
        />
      </button>
    </div>
  );
}
