"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";

import { UNIVERSITY_MAP } from "@/lib/university-config";
import { cn } from "@/lib/utils";

type UniversityOption = {
  code: string;
  name: string;
  stars?: number;
};

export function PlayerSearch({ playerNames = [] }: { playerNames?: string[] }) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const debounceRef = useRef<NodeJS.Timeout>(undefined);

  const handleSearch = useCallback(
    (term: string) => {
      if (debounceRef.current) clearTimeout(debounceRef.current);

      debounceRef.current = setTimeout(() => {
        const lowerTerm = term.trim().toLowerCase();
        const hasMatch = lowerTerm ? playerNames.some((name) => name.toLowerCase().includes(lowerTerm)) : false;
        const params = new URLSearchParams(searchParams.toString());

        if (lowerTerm && hasMatch) {
          params.set("search", lowerTerm);
        } else {
          params.delete("search");
        }

        router.push(`?${params.toString()}`, { scroll: false });
      }, 200);
    },
    [playerNames, router, searchParams]
  );

  return (
    <div className="group relative w-full md:w-64">
      <div className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-white/20 transition-colors group-focus-within:text-nzu-green">
        <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
          <circle cx="11" cy="11" r="8" />
          <path d="m21 21-4.3-4.3" />
        </svg>
      </div>
      <input
        type="text"
        placeholder="선수 검색..."
        defaultValue={searchParams.get("search") || ""}
        onChange={(event) => handleSearch(event.target.value)}
        className="w-full rounded-2xl border border-white/10 bg-white/5 py-2 pl-9 pr-4 text-[11px] font-bold tracking-wider text-white placeholder:text-white/10 transition-all focus:border-nzu-green/40 focus:bg-white/10 focus:outline-none"
      />
    </div>
  );
}

export function RaceFilter() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const currentRace = searchParams.get("race") || "ALL";

  const handleRace = (race: string) => {
    const params = new URLSearchParams(searchParams);
    if (currentRace === race || race === "ALL") {
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
    { id: "P", label: "프로토스" },
  ];

  const getRaceGradient = (raceId: string) => {
    switch (raceId) {
      case "T":
        return "bg-gradient-to-br from-blue-600 to-blue-400 text-white shadow-lg shadow-blue-500/20";
      case "Z":
        return "bg-gradient-to-br from-purple-600 to-purple-400 text-white shadow-lg shadow-purple-500/20";
      case "P":
        return "bg-gradient-to-br from-yellow-500 to-yellow-300 text-black shadow-lg shadow-yellow-500/10";
      default:
        return "bg-nzu-green text-black shadow-lg shadow-nzu-green/20";
    }
  };

  return (
    <div className="flex items-center gap-1 rounded-2xl border border-white/10 bg-white/5 p-1">
      {races.map((race) => {
        const isActive = currentRace === race.id;

        return (
          <button
            key={race.id}
            onClick={() => handleRace(race.id)}
            className={cn(
              "flex min-w-[64px] items-center justify-center rounded-2xl px-4 py-2 text-xs font-bold tracking-tight transition-all",
              isActive ? getRaceGradient(race.id) : "text-white/30 hover:bg-white/5 hover:text-white"
            )}
          >
            {race.label}
          </button>
        );
      })}
    </div>
  );
}

function sortUniversityOptions(options: UniversityOption[]) {
  return [...options].sort((left, right) => {
    const isFaLeft = left.name === "무소속" || left.code === "FA";
    const isFaRight = right.name === "무소속" || right.code === "FA";
    if (isFaLeft !== isFaRight) return isFaLeft ? 1 : -1;

    const isKorean = (value: string) => /[\u3131-\u314e\u314f-\u3163\uac00-\ud7a3]/.test(value);
    if (isKorean(left.name) !== isKorean(right.name)) return isKorean(left.name) ? -1 : 1;
    return left.name.localeCompare(right.name, "ko");
  });
}

export function UnivFilter({ options }: { options?: UniversityOption[] }) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const currentUniv = searchParams.get("univ") || "ALL";

  const handleUniv = (univ: string) => {
    const params = new URLSearchParams(searchParams);
    if (currentUniv === univ || univ === "ALL") {
      params.delete("univ");
    } else {
      params.set("univ", univ);
    }
    router.push(`?${params.toString()}`, { scroll: false });
  };

  const sortedOptions = (() => {
    if (Array.isArray(options) && options.length > 0) {
      return sortUniversityOptions(options);
    }

    return sortUniversityOptions(
      Object.entries(UNIVERSITY_MAP).map(([code, info]) => ({
        code,
        name: info.name,
        stars: info.stars,
      }))
    );
  })();

  return (
    <div className="flex flex-wrap items-center gap-4 rounded-3xl border border-white/10 bg-white/[0.03] p-4 backdrop-blur-sm">
      <button
        onClick={() => handleUniv("ALL")}
        className={cn(
          "whitespace-nowrap rounded-2xl border border-transparent px-8 py-4 text-sm font-black transition-all",
          currentUniv === "ALL" ? "scale-105 bg-white text-black shadow-[0_0_20px_rgba(255,255,255,0.3)]" : "bg-white/5 text-white/40 hover:bg-white/10 hover:text-white"
        )}
      >
        전체 학교
      </button>

      {sortedOptions.map((option) => {
        const isActive = currentUniv === option.code;
        const starCount = option.stars ?? 0;

        return (
          <button
            key={option.code}
            onClick={() => handleUniv(option.code)}
            className={cn(
              "group relative whitespace-nowrap rounded-2xl border border-transparent px-8 py-4 text-sm font-black transition-all",
              isActive
                ? "scale-105 border-white/20 bg-gradient-to-br from-nzu-green/80 to-nzu-green text-black shadow-[0_0_25px_rgba(46,213,115,0.4)]"
                : "bg-white/5 text-white/40 hover:bg-white/10 hover:text-white"
            )}
          >
            {starCount > 0 && (
              <div className="absolute left-1/2 top-[-8px] flex -translate-x-1/2 gap-0.5">
                {[...Array(starCount)].map((_, index) => (
                  <span key={index} className="text-[14px] text-yellow-400 drop-shadow-[0_0_5px_rgba(250,204,21,0.8)]">
                    ★
                  </span>
                ))}
              </div>
            )}
            {option.name}
          </button>
        );
      })}
    </div>
  );
}

export function RaceToggle() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const paramToggled = searchParams.get("raceToggle") === "true";
  const [isToggled, setIsToggled] = useState(paramToggled);

  useEffect(() => {
    setIsToggled(paramToggled);
  }, [paramToggled]);

  const handleToggle = () => {
    const newState = !isToggled;
    setIsToggled(newState);

    const params = new URLSearchParams(searchParams);
    if (newState) {
      params.set("raceToggle", "true");
    } else {
      params.delete("raceToggle");
    }
    router.push(`?${params.toString()}`, { scroll: false });
  };

  return (
    <div className="flex items-center gap-4 rounded-2xl border border-white/10 bg-white/[0.03] px-6 py-3 backdrop-blur-sm">
      <span className="mb-0.5 text-sm font-black uppercase tracking-widest text-white/60">종족 구분</span>
      <button
        onClick={handleToggle}
        className={cn("relative inline-flex h-7 w-14 items-center rounded-full shadow-inner transition-all duration-300 focus:outline-none", isToggled ? "bg-nzu-green" : "bg-white/10")}
      >
        <span className={cn("inline-block h-5 w-5 rounded-full bg-white shadow-lg transition-transform duration-300", isToggled ? "translate-x-8" : "translate-x-1")} />
      </button>
    </div>
  );
}

export function LiveToggle() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const paramToggled = searchParams.get("liveOnly") === "true";
  const [isToggled, setIsToggled] = useState(paramToggled);

  useEffect(() => {
    setIsToggled(paramToggled);
  }, [paramToggled]);

  const handleToggle = () => {
    const newState = !isToggled;
    setIsToggled(newState);

    const params = new URLSearchParams(searchParams);
    if (newState) {
      params.set("liveOnly", "true");
    } else {
      params.delete("liveOnly");
    }
    router.push(`?${params.toString()}`, { scroll: false });
  };

  return (
    <div className="flex items-center gap-4 rounded-2xl border border-red-500/20 bg-red-500/[0.05] px-6 py-3 backdrop-blur-sm">
      <div className="flex items-center gap-2">
        <div className={cn("h-2 w-2 rounded-full", isToggled ? "animate-pulse bg-red-500" : "bg-white/20")} />
        <span className={cn("mb-0.5 text-sm font-black uppercase tracking-widest transition-colors", isToggled ? "text-red-500" : "text-white/60")}>방송중</span>
      </div>
      <button
        onClick={handleToggle}
        className={cn("relative inline-flex h-7 w-14 items-center rounded-full shadow-inner transition-all duration-300 focus:outline-none", isToggled ? "bg-red-500" : "bg-white/10")}
      >
        <span className={cn("inline-block h-5 w-5 rounded-full bg-white shadow-lg transition-transform duration-300", isToggled ? "translate-x-8" : "translate-x-1")} />
      </button>
    </div>
  );
}

export function SmartStickyHeader({ children }: { children: React.ReactNode }) {
  const [isVisible, setIsVisible] = useState(true);
  const [lastScrollY, setLastScrollY] = useState(0);

  useEffect(() => {
    const handleScroll = () => {
      const currentScrollY = window.scrollY;

      if (currentScrollY > lastScrollY && currentScrollY > 100) {
        setIsVisible(false);
      } else if (currentScrollY < lastScrollY || currentScrollY < 50) {
        setIsVisible(true);
      }

      setLastScrollY(currentScrollY);
    };

    window.addEventListener("scroll", handleScroll, { passive: true });
    return () => window.removeEventListener("scroll", handleScroll);
  }, [lastScrollY]);

  return (
    <div className={cn("sticky z-40 transition-all duration-500 ease-[cubic-bezier(0.23,1,0.32,1)]", isVisible ? "top-0 translate-y-0 opacity-100" : "pointer-events-none top-0 -translate-y-[120%] opacity-0")}>
      {children}
    </div>
  );
}
