"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";

import type { MatchupPlayerSummary } from "@/lib/matchup-helpers";
import { buildPlayerHref } from "@/lib/player-route";
import { normalizeRaceValue } from "@/lib/player-matchup-summary";
import { getUniversityLabel } from "@/lib/university-config";
import { getTierLabel } from "@/lib/utils";

type PlayerSearchFormProps = {
  initialQuery?: string;
};

function filterPlayers(players: MatchupPlayerSummary[], query: string) {
  const q = query.trim().toLowerCase();
  if (!q) return [];
  return players
    .filter((p) => {
      const name = p.name.toLowerCase();
      const nickname = p.nickname?.toLowerCase() ?? "";
      return name.includes(q) || nickname.includes(q);
    })
    .slice(0, 8);
}

function findExactMatch(players: MatchupPlayerSummary[], query: string) {
  const q = query.trim().toLowerCase();
  if (!q) return undefined;
  return players.find(
    (p) => p.name.toLowerCase() === q || (p.nickname && p.nickname.toLowerCase() === q)
  );
}

export default function PlayerSearchForm({ initialQuery = "" }: PlayerSearchFormProps) {
  const router = useRouter();
  const [query, setQuery] = useState(initialQuery);
  const [players, setPlayers] = useState<MatchupPlayerSummary[] | null>(null);
  const [isOpen, setIsOpen] = useState(false);
  const [activeIndex, setActiveIndex] = useState(-1);
  const containerRef = useRef<HTMLDivElement>(null);
  const fetchedRef = useRef(false);

  useEffect(() => {
    setQuery(initialQuery);
  }, [initialQuery]);

  function fetchPlayers() {
    if (fetchedRef.current) return;
    fetchedRef.current = true;
    fetch("/api/players")
      .then((r) => r.json())
      .then((data) => {
        if (Array.isArray(data?.players)) {
          setPlayers(data.players as MatchupPlayerSummary[]);
        }
      })
      .catch(() => {
        fetchedRef.current = false;
      });
  }

  const results = players ? filterPlayers(players, query) : [];
  const showDropdown = isOpen && results.length > 0;

  useEffect(() => {
    if (!showDropdown) return;
    function onPointerDown(e: PointerEvent) {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setIsOpen(false);
      }
    }
    document.addEventListener("pointerdown", onPointerDown);
    return () => document.removeEventListener("pointerdown", onPointerDown);
  }, [showDropdown]);

  function handleSubmit(event: { preventDefault(): void }) {
    event.preventDefault();
    setIsOpen(false);
    const trimmed = query.trim();
    if (!trimmed) {
      router.push("/player");
      return;
    }

    const active = activeIndex >= 0 ? results[activeIndex] : null;
    if (active) {
      router.push(buildPlayerHref(active));
      return;
    }

    if (players) {
      const exact = findExactMatch(players, trimmed);
      if (exact) {
        router.push(buildPlayerHref(exact));
        return;
      }
    }

    router.push(`/player?query=${encodeURIComponent(trimmed)}`);
  }

  function handleKeyDown(e: React.KeyboardEvent) {
    if (!showDropdown) return;
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setActiveIndex((i) => Math.min(i + 1, results.length - 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setActiveIndex((i) => Math.max(i - 1, -1));
    } else if (e.key === "Escape") {
      setIsOpen(false);
      setActiveIndex(-1);
    }
  }

  return (
    <div ref={containerRef} className="mx-auto mt-5 w-full max-w-5xl xl:max-w-6xl">
      <form className="flex flex-col gap-2.5 md:flex-row" onSubmit={handleSubmit}>
        <div className="relative flex-1">
          <input
            type="text"
            name="query"
            value={query}
            autoComplete="off"
            onChange={(e) => {
              fetchPlayers();
              setQuery(e.target.value);
              setIsOpen(true);
              setActiveIndex(-1);
            }}
            onFocus={() => {
              fetchPlayers();
              if (query.trim()) setIsOpen(true);
            }}
            onKeyDown={handleKeyDown}
            placeholder="선수 이름을 입력하세요"
            className="h-[56px] w-full rounded-[1.15rem] border border-white/10 bg-[#0a1112]/88 px-5 text-[1rem] font-[1000] tracking-tight text-white placeholder:text-white/14 shadow-[inset_0_1px_0_rgba(255,255,255,0.03)] transition-all focus:border-nzu-green/40 focus:outline-none md:h-[58px] md:text-[1.04rem] xl:h-[60px] xl:text-[1.06rem]"
          />
          {showDropdown ? (
            <div className="absolute top-[calc(100%+0.4rem)] left-0 right-0 z-50 overflow-hidden rounded-[1.15rem] border border-white/10 bg-[#061015] shadow-[0_20px_60px_rgba(0,0,0,0.5)]">
              {results.map((player, index) => (
                <Link
                  key={player.id}
                  href={buildPlayerHref(player)}
                  onMouseDown={(e) => e.preventDefault()}
                  onClick={() => setIsOpen(false)}
                  className={`flex items-center justify-between gap-3 px-4 py-3 transition-colors ${
                    index === activeIndex
                      ? "bg-nzu-green/[0.1] text-nzu-green"
                      : "text-white hover:bg-white/[0.04] hover:text-nzu-green"
                  }${index < results.length - 1 ? " border-b border-white/6" : ""}`}
                >
                  <span className="truncate font-[1000] tracking-tight">{player.name}</span>
                  <span className="shrink-0 text-[0.76rem] font-[900] tracking-tight text-white/46">
                    {[getUniversityLabel(player.university), getTierLabel(player.tier), normalizeRaceValue(player.race)]
                      .filter(Boolean)
                      .join(" · ")}
                  </span>
                </Link>
              ))}
            </div>
          ) : null}
        </div>
        <button
          type="submit"
          className="h-[56px] shrink-0 rounded-[1.15rem] border border-nzu-green/20 bg-nzu-green/[0.08] px-6 text-[0.98rem] font-[1000] tracking-tight text-nzu-green transition-all hover:border-nzu-green/40 hover:bg-nzu-green/[0.14] hover:text-white md:h-[58px] md:w-[132px] md:text-[1rem] xl:h-[60px] xl:w-[140px]"
        >
          검색
        </button>
      </form>
    </div>
  );
}
