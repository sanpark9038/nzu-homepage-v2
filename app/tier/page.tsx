import Link from "next/link";

import { H2HSelectorBar } from "@/components/players/H2HSelectorBar";
import { LiveToggle, PlayerSearch, RaceToggle, SmartStickyHeader, UnivFilter } from "@/components/players/Filters";
import { TeamTierCompactGrid } from "@/components/players/TeamTierCompactGrid";
import { TierGroup } from "@/components/players/TierGroup";
import { getUniversityOptions } from "@/lib/university-metadata";
import { playerService } from "@/lib/player-service";
import {
  NAMED_TIER_LABELS,
  buildCompactTeamTierPlayers,
  buildNamedTierPlayers,
  buildNumericTierGroups,
  buildTierNavigation,
  filterTierPlayers,
} from "@/lib/tier-page-helpers";

export const revalidate = 300;

export default async function TierPage({
  searchParams,
}: {
  searchParams: { search?: string; race?: string; univ?: string; tier?: string; raceToggle?: string; liveOnly?: string };
}) {
  const params = await searchParams;
  const search = params.search;
  const race = params.race;
  const univ = params.univ;
  const tier = params.tier;
  const liveOnly = params.liveOnly === "true";

  const universityOptions = getUniversityOptions();
  const allPlayers = await playerService.getCachedPlayersList();
  const playerList = filterTierPlayers(allPlayers, {
    liveOnly,
    race,
    university: univ,
    tier,
    search,
  });

  const { godPlayers, kingPlayers, jackPlayers, jokerPlayers, spadePlayers, babyPlayers } = buildNamedTierPlayers(playerList);
  const numericTiers = [0, 1, 2, 3, 4, 5, 6, 7, 8];
  const numericTierGroups = buildNumericTierGroups(playerList, numericTiers);
  const compactTeamPlayers = buildCompactTeamTierPlayers(playerList, numericTiers);
  const tiers = buildTierNavigation(numericTiers);
  const hasResults = playerList.length > 0;
  const raceGrouped = params.raceToggle === "true";
  const selectedUniversity = String(univ || "").trim();
  const isTeamCompactView = Boolean(selectedUniversity && selectedUniversity !== "ALL");

  return (
    <div className="min-h-screen flex flex-col bg-background">
      <H2HSelectorBar />

      <main className="relative mx-auto flex-1 w-full max-w-[1800px] px-4 pb-8 fade-in lg:px-8">
        <div className="flex flex-col gap-8 lg:flex-row">
          <div className="flex min-w-0 flex-1 flex-col">
            <SmartStickyHeader>
              <div className="-mx-4 mb-8 flex flex-col items-start justify-between gap-4 border-b border-white/10 bg-background/95 p-3 px-4 shadow-lg shadow-black/20 backdrop-blur-xl md:flex-row md:items-center lg:-mx-8 lg:p-4 lg:px-8">
                <div className="w-full max-w-md md:w-64">
                  <PlayerSearch playerNames={allPlayers.map((player) => player.name)} />
                </div>
                <div className="hide-scrollbar flex w-full shrink-0 items-center justify-end gap-4 overflow-x-auto md:w-auto">
                  <LiveToggle />
                  <RaceToggle />
                </div>
              </div>
            </SmartStickyHeader>

            <div className="mb-12 flex flex-col gap-10 border-b border-foreground/5 pb-10">
              <div className="flex flex-col gap-6">
                <UnivFilter options={universityOptions} />
              </div>
            </div>

            {!hasResults ? (
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
                <div className="vertical-rl z-10 flex cursor-pointer items-center justify-center rounded-2xl border border-nzu-green/30 bg-nzu-green/[0.08] px-4 py-8 text-center text-[17px] font-[1000] tracking-[0.12em] text-nzu-green/95 shadow-[0_0_24px_rgba(46,213,115,0.12)] backdrop-blur-md transition-all duration-300 group-hover:scale-95 group-hover:opacity-0">
                  티어 목록
                </div>

                <div className="pointer-events-none absolute right-0 top-0 z-20 w-28 translate-y-[-36%] scale-95 overflow-hidden rounded-2xl border border-nzu-green/35 bg-[#0b1510]/95 opacity-0 shadow-[0_0_28px_rgba(46,213,115,0.14)] backdrop-blur-xl transition-all duration-300 group-hover:pointer-events-auto group-hover:scale-100 group-hover:opacity-100">
                  <div className="border-b border-nzu-green/15 bg-nzu-green/[0.12] p-2.5">
                    <p className="text-center text-[12px] font-[1000] tracking-[0.18em] text-nzu-green">티어 목록</p>
                  </div>
                  <div className="flex flex-col p-1.5">
                    {tiers.map((tierItem) => (
                      <a
                        key={tierItem.id}
                        href={`#tier-${tierItem.id}`}
                        className="rounded-lg px-3 py-2 text-center text-[14px] font-black tracking-tight text-foreground/75 transition-all hover:bg-nzu-green hover:text-black"
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
          <div className="flex flex-col items-center gap-1 text-center md:items-start md:text-left">
            <span className="mb-2 text-[13px] font-black uppercase tracking-widest text-nzu-green transition-colors">티어표 출처: HOSAGA ARCHIVE</span>
            <p className="text-[10px] font-bold uppercase tracking-[0.2em] text-foreground/30">© 2026 HOSAGA UNIVERSITY. 모든 권리 보유.</p>
          </div>

          <div className="flex items-center gap-8">
            <div className="flex flex-col items-end gap-1">
              <span className="text-[10px] font-black tracking-widest text-foreground/40">구동</span>
              <span className="text-sm font-black tracking-tighter text-foreground transition-colors">HOSAGA 티어표 아카이브</span>
            </div>
          </div>
        </div>
      </footer>
    </div>
  );
}
