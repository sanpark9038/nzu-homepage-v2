
"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { useCallback, useState, useEffect, useRef } from "react";
import { cn } from "@/lib/utils";
import { UNIVERSITY_MAP } from "@/lib/university-config";

export function PlayerSearch({ playerNames = [] }: { playerNames?: string[] }) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const debounceRef = useRef<NodeJS.Timeout>(undefined);

  const handleSearch = useCallback((term: string) => {
    if (debounceRef.current) clearTimeout(debounceRef.current);

    debounceRef.current = setTimeout(() => {
      const lowerTerm = term.trim().toLowerCase();
      
      // 입력된 문자열(term)이 존재하고, 일치하는 선수가 단 한 명이라도 있는지 클라이언트 사이드 검증
      const hasMatch = lowerTerm ? playerNames.some(name => name.toLowerCase().includes(lowerTerm)) : false;

      const params = new URLSearchParams(searchParams.toString());
      
      if (lowerTerm && hasMatch) {
        params.set("search", lowerTerm);
      } else {
        // 일치하는 선수가 없거나 빈 문자열일 경우, 아무 조건 없는 기본 URL로 복원하여 기존 리스트 유지
        params.delete("search");
      }
      
      router.push(`?${params.toString()}`, { scroll: false });
    }, 200); // 0.2초로 반응속도 한 단계 더 최적화
  }, [router, searchParams, playerNames]);

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
        className="w-full bg-white/5 border border-white/10 rounded-2xl py-2 pl-9 pr-4 text-[11px] font-bold text-white placeholder:text-white/10 focus:outline-none focus:border-nzu-green/40 focus:bg-white/10 transition-all tracking-wider"
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
    <div className="flex items-center bg-white/5 border border-white/10 rounded-2xl p-1 gap-1">
      {races.map((r) => {
        const isActive = currentRace === r.id;
        return (
          <button
            key={r.id}
            onClick={() => handleRace(r.id)}
            className={cn(
              "px-4 py-2 rounded-2xl text-xs font-bold transition-all tracking-tight min-w-[64px] flex items-center justify-center",
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
    const keys = Object.keys(UNIVERSITY_MAP) as string[];
    
    return keys.sort((a, b) => {
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
        const starCount = u.stars ?? 0;

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

export function RaceToggle() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const paramToggled = searchParams.get("raceToggle") === "true";
  
  // 낙관적 UI(Optimistic UI) 적용: 클릭 즉시 로컬 상태를 변경해 버벅임 제거
  const [isToggled, setIsToggled] = useState(paramToggled);

  useEffect(() => {
    setIsToggled(paramToggled);
  }, [paramToggled]);

  const handleToggle = () => {
    const newState = !isToggled;
    setIsToggled(newState); // 즉각적인 UI 반응

    const params = new URLSearchParams(searchParams);
    if (newState) {
      params.set("raceToggle", "true");
    } else {
      params.delete("raceToggle");
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

export function LiveToggle() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const paramToggled = searchParams.get("liveOnly") === "true";
  
  // 낙관적 UI(Optimistic UI) 적용
  const [isToggled, setIsToggled] = useState(paramToggled);

  useEffect(() => {
    setIsToggled(paramToggled);
  }, [paramToggled]);

  const handleToggle = () => {
    const newState = !isToggled;
    setIsToggled(newState); // 즉각적인 UI 반응

    const params = new URLSearchParams(searchParams);
    if (newState) {
      params.set("liveOnly", "true");
    } else {
      params.delete("liveOnly");
    }
    router.push(`?${params.toString()}`, { scroll: false });
  };

  return (
    <div className="flex items-center gap-4 bg-red-500/[0.05] px-6 py-3 rounded-2xl border border-red-500/20 backdrop-blur-sm">
      <div className="flex items-center gap-2">
        <div className={cn("w-2 h-2 rounded-full", isToggled ? "bg-red-500 animate-pulse" : "bg-white/20")} />
        <span className={cn("text-sm font-black uppercase tracking-widest transition-colors mb-0.5", isToggled ? "text-red-500" : "text-white/60")}>
          방송 중
        </span>
      </div>
      <button 
        onClick={handleToggle}
        className={cn(
          "relative inline-flex items-center h-7 w-14 rounded-full transition-all duration-300 focus:outline-none shadow-inner",
          isToggled ? "bg-red-500" : "bg-white/10"
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

    window.addEventListener('scroll', handleScroll, { passive: true });
    return () => window.removeEventListener('scroll', handleScroll);
  }, [lastScrollY]);

  return (
    <div 
      className={cn(
        "sticky z-40 transition-all duration-500 ease-[cubic-bezier(0.23,1,0.32,1)]",
        isVisible ? "top-0 translate-y-0 opacity-100" : "top-0 -translate-y-[120%] opacity-0 pointer-events-none"
      )}
    >
      {children}
    </div>
  );
}
