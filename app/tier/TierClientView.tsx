"use client";

import Link from "next/link";
import { LockKeyhole } from "lucide-react";
import { useEffect, useMemo, useState } from "react";

import { H2HSelectorBar } from "@/components/players/H2HSelectorBar";
import { LiveToggle, PlayerSearch, RaceToggle, SmartStickyHeader, UnivFilter } from "@/components/players/Filters";
import { TeamTierCompactGrid } from "@/components/players/TeamTierCompactGrid";
import { TierGroup } from "@/components/players/TierGroup";
import { TierLiveHoverPreviewLayer } from "@/components/players/TierLiveHoverPreview";
import { TIER_PLAYER_GRID_CLASS } from "@/components/players/tier-grid-layout";
import type { UniversityMetadataEntry } from "@/lib/university-metadata";
import {
  NAMED_TIER_LABELS,
  buildCompactTeamTierPlayers,
  buildNamedTierPlayers,
  buildNumericTierGroups,
  buildTierNavigation,
} from "@/lib/tier-page-helpers";
import type { Player } from "@/types";

type TierClientViewProps = {
  queryString: string;
  universityOptions: UniversityMetadataEntry[];
};

type TierPlayersPayload = {
  liveOnly: boolean;
  players: Player[];
  playerNames: string[];
  generatedAt: string;
};

type TierLoadState = {
  queryString: string;
  payload: TierPlayersPayload | null;
  error: string | null;
};

const tierPlayersRequestCache = new Map<string, Promise<TierPlayersPayload>>();

function buildTierApiUrl(queryString: string) {
  const query = String(queryString || "").trim();
  return query ? `/api/tier/players?${query}` : "/api/tier/players";
}

function loadTierPlayers(apiUrl: string) {
  const cachedRequest = tierPlayersRequestCache.get(apiUrl);
  if (cachedRequest) return cachedRequest;

  const request = fetch(apiUrl)
    .then((response) => {
      if (!response.ok) throw new Error(`tier_players_${response.status}`);
      return response.json() as Promise<TierPlayersPayload>;
    })
    .catch((err) => {
      tierPlayersRequestCache.delete(apiUrl);
      throw err;
    });

  tierPlayersRequestCache.set(apiUrl, request);
  return request;
}

function readBrowserQueryString(fallback: string) {
  if (typeof window === "undefined") return fallback;
  return window.location.search.replace(/^\?/, "");
}

function TierGridSkeleton() {
  return (
    <div className={TIER_PLAYER_GRID_CLASS}>
      {Array.from({ length: 18 }).map((_, index) => (
        <div
          key={index}
          className="h-[11.75rem] w-full max-w-56 rounded-2xl border-[3px] border-white/10 bg-white/[0.035]"
        />
      ))}
    </div>
  );
}

export function TierClientView({ queryString, universityOptions }: TierClientViewProps) {
  const [activeQueryString, setActiveQueryString] = useState(queryString);
  const [loadState, setLoadState] = useState<TierLoadState>({
    queryString: "",
    payload: null,
    error: null,
  });
  const params = useMemo(() => new URLSearchParams(activeQueryString), [activeQueryString]);

  useEffect(() => {
    const syncFromLocation = () => setActiveQueryString(readBrowserQueryString(queryString));
    const handleFilterQueryChange = (event: Event) => {
      const nextQueryString = (event as CustomEvent<{ queryString?: unknown }>).detail?.queryString;
      setActiveQueryString(typeof nextQueryString === "string" ? nextQueryString : readBrowserQueryString(queryString));
    };

    syncFromLocation();
    window.addEventListener("popstate", syncFromLocation);
    window.addEventListener("tier-filter-query-change", handleFilterQueryChange);

    return () => {
      window.removeEventListener("popstate", syncFromLocation);
      window.removeEventListener("tier-filter-query-change", handleFilterQueryChange);
    };
  }, [queryString]);

  useEffect(() => {
    let isCurrent = true;
    const apiUrl = buildTierApiUrl(activeQueryString);

    loadTierPlayers(apiUrl)
      .then((nextPayload) => {
        if (!isCurrent) return;
        setLoadState({ queryString: activeQueryString, payload: nextPayload, error: null });
      })
      .catch(() => {
        if (!isCurrent) return;
        setLoadState({ queryString: activeQueryString, payload: null, error: "티어표를 불러오지 못했습니다." });
      });

    return () => {
      isCurrent = false;
    };
  }, [activeQueryString]);

  const payload = loadState.queryString === activeQueryString ? loadState.payload : null;
  const error = loadState.queryString === activeQueryString ? loadState.error : null;
  const isLoading = !payload && !error;
  const playerList = payload?.players || [];
  const { godPlayers, kingPlayers, jackPlayers, jokerPlayers, spadePlayers, babyPlayers } = buildNamedTierPlayers(playerList);
  const numericTiers = [0, 1, 2, 3, 4, 5, 6, 7, 8];
  const numericTierGroups = buildNumericTierGroups(playerList, numericTiers);
  const compactTeamPlayers = buildCompactTeamTierPlayers(playerList, numericTiers);
  const tiers = buildTierNavigation(numericTiers);
  const hasResults = playerList.length > 0;
  const liveOnly = params.get("liveOnly") !== "false";
  const raceGrouped = params.get("raceToggle") === "true";
  const selectedUniversity = String(params.get("univ") || "").trim();
  const isTeamCompactView = Boolean(selectedUniversity && selectedUniversity !== "ALL");

  return (
    <div className="min-h-screen flex flex-col bg-background" data-tier-live-only={liveOnly ? "true" : "false"}>
      <H2HSelectorBar />
      <TierLiveHoverPreviewLayer />

      <main className="relative mx-auto flex-1 w-full max-w-[1800px] px-4 pb-8 lg:px-8">
        <div className="flex flex-col gap-8 lg:flex-row">
          <div className="flex min-w-0 flex-1 flex-col">
            <SmartStickyHeader>
              <div className="-mx-4 mb-8 flex flex-col items-start justify-between gap-4 border-b border-white/10 bg-background/95 p-3 px-4 shadow-lg shadow-black/20 backdrop-blur-xl md:flex-row md:items-center lg:-mx-8 lg:p-4 lg:px-8">
                <div className="w-full max-w-md md:w-64">
                  <PlayerSearch playerNames={payload?.playerNames || []} queryString={activeQueryString} />
                </div>
                <div className="hide-scrollbar flex w-full shrink-0 items-center justify-end gap-4 overflow-x-auto md:w-auto">
                  <LiveToggle queryString={activeQueryString} />
                  <RaceToggle queryString={activeQueryString} />
                </div>
              </div>
            </SmartStickyHeader>

            <div className="mb-12 flex flex-col gap-10 border-b border-foreground/5 pb-10">
              <div className="flex flex-col gap-6">
                <UnivFilter options={universityOptions} queryString={activeQueryString} />
              </div>
            </div>

            {isLoading && !payload ? (
              <TierGridSkeleton />
            ) : error ? (
              <div className="rounded-3xl border border-dashed border-foreground/10 bg-foreground/[0.02] py-32 text-center">
                <h2 className="mb-2 text-xl font-bold text-foreground">{error}</h2>
                <Link href="/tier" className="rounded-xl bg-nzu-green px-10 py-4 text-xs font-black uppercase tracking-widest text-black shadow-lg shadow-nzu-green/20 transition-colors">
                  초기화하기
                </Link>
              </div>
            ) : !hasResults ? (
              <div className="rounded-3xl border border-dashed border-foreground/10 bg-foreground/[0.02] py-32 text-center">
                <div className="mb-6 text-4xl opacity-30">🕵️‍♂️</div>
                <h2 className="mb-2 text-xl font-bold text-foreground">조건에 맞는 선수가 없습니다</h2>
                <p className="mb-8 text-sm text-foreground/40">검색어나 필터를 조금 더 넓게 조정해 보세요.</p>
                <Link href="/tier" className="rounded-xl bg-nzu-green px-10 py-4 text-xs font-black uppercase tracking-widest text-black shadow-lg shadow-nzu-green/20 transition-colors">
                  초기화하기
                </Link>
              </div>
            ) : isTeamCompactView ? (
              <TeamTierCompactGrid players={compactTeamPlayers} selectedUniversity={selectedUniversity} />
            ) : (
              <div className="space-y-16">
                {godPlayers.length > 0 && (
                  <div id="tier-god">
                    <TierGroup rankName={NAMED_TIER_LABELS.god} players={godPlayers} startIndex={0} showRaceGroups={raceGrouped} />
                  </div>
                )}
                {kingPlayers.length > 0 && (
                  <div id="tier-king">
                    <TierGroup rankName={NAMED_TIER_LABELS.king} players={kingPlayers} startIndex={godPlayers.length} showRaceGroups={raceGrouped} />
                  </div>
                )}
                {jackPlayers.length > 0 && (
                  <div id="tier-jack">
                    <TierGroup rankName={NAMED_TIER_LABELS.jack} players={jackPlayers} startIndex={godPlayers.length + kingPlayers.length} showRaceGroups={raceGrouped} />
                  </div>
                )}
                {jokerPlayers.length > 0 && (
                  <div id="tier-joker">
                    <TierGroup rankName={NAMED_TIER_LABELS.joker} players={jokerPlayers} startIndex={godPlayers.length + kingPlayers.length + jackPlayers.length} showRaceGroups={raceGrouped} />
                  </div>
                )}
                {spadePlayers.length > 0 && (
                  <div id="tier-spade">
                    <TierGroup
                      rankName={NAMED_TIER_LABELS.spade}
                      players={spadePlayers}
                      startIndex={godPlayers.length + kingPlayers.length + jackPlayers.length + jokerPlayers.length}
                      showRaceGroups={raceGrouped}
                    />
                  </div>
                )}

                {numericTierGroups.map((group, index) => {
                  const prevCount =
                    godPlayers.length +
                    kingPlayers.length +
                    jackPlayers.length +
                    jokerPlayers.length +
                    spadePlayers.length +
                    numericTierGroups.slice(0, index).reduce((acc, current) => acc + current.players.length, 0);

                  return (
                    <div key={group.tier} id={`tier-${group.tier}`}>
                      <TierGroup rankName={group.name} players={group.players} startIndex={prevCount} showRaceGroups={raceGrouped} />
                    </div>
                  );
                })}

                {babyPlayers.length > 0 && (
                  <div id="tier-baby">
                    <TierGroup
                      rankName={NAMED_TIER_LABELS.baby}
                      players={babyPlayers}
                      startIndex={playerList.length - babyPlayers.length}
                      showRaceGroups={raceGrouped}
                      emptyMessage="베이비 티어 선수는 아직 등록되지 않았습니다"
                    />
                  </div>
                )}
              </div>
            )}
          </div>

          <div className="relative hidden w-16 lg:block">
            {!isTeamCompactView ? (
              <div className="sticky top-72 z-50 flex justify-end">
                <div className="group relative flex w-full flex-col items-center">
                  <div className="vertical-rl z-10 flex cursor-pointer items-center justify-center rounded-2xl border border-nzu-green/30 bg-nzu-green/[0.08] px-4 py-8 text-center text-[17px] font-[1000] tracking-[0.12em] text-nzu-green/95 shadow-[0_0_24px_rgba(46,213,115,0.12)] backdrop-blur-md transition-opacity duration-200 group-hover:opacity-0">
                    티어 목록
                  </div>

                  <div className="pointer-events-none absolute right-0 top-0 z-20 w-28 translate-y-[-36%] overflow-hidden rounded-2xl border border-nzu-green/35 bg-[#0b1510]/95 opacity-0 shadow-[0_0_28px_rgba(46,213,115,0.14)] backdrop-blur-xl transition-opacity duration-200 group-hover:pointer-events-auto group-hover:opacity-100">
                    <div className="border-b border-nzu-green/15 bg-nzu-green/[0.12] p-2.5">
                      <p className="text-center text-[12px] font-[1000] tracking-[0.18em] text-nzu-green">티어 목록</p>
                    </div>
                    <div className="flex flex-col p-1.5">
                      {tiers.map((tierItem) => (
                        <a
                          key={tierItem.id}
                          href={`#tier-${tierItem.id}`}
                          className="rounded-lg px-3 py-2 text-center text-[14px] font-black tracking-tight text-foreground/75 transition-colors hover:bg-nzu-green hover:text-black"
                        >
                          {tierItem.name}
                        </a>
                      ))}
                    </div>
                  </div>
                </div>
              </div>
            ) : null}
          </div>
        </div>
      </main>

      <footer className="relative z-10 border-t border-white/5 py-12">
        <div className="mx-auto flex max-w-[1800px] flex-col items-center justify-between gap-6 px-16 md:flex-row">
          <Link
            href="/admin"
            aria-label="Admin"
            className="inline-flex h-9 w-9 items-center justify-center rounded-full border border-white/10 bg-white/[0.03] text-foreground/35 transition-colors hover:border-nzu-green/60 hover:text-nzu-green"
          >
            <LockKeyhole className="h-4 w-4" aria-hidden="true" />
          </Link>

          <div className="flex flex-col items-center gap-1 text-center md:items-start md:text-left">
            <span className="mb-2 text-[13px] font-black uppercase tracking-widest text-nzu-green transition-colors">
              {"\uC804\uC801 \uCD9C\uCC98: ELOBOARD.COM"}
            </span>
            <p className="text-[10px] font-bold uppercase tracking-[0.2em] text-foreground/30">2026 HOSAGA BY SANPARK.</p>
          </div>
        </div>
      </footer>
    </div>
  );
}
