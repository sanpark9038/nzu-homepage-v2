
import { TierGroup } from "@/components/players/TierGroup";
import { H2HSelectorBar } from "@/components/players/H2HSelectorBar";
import { playerService } from "@/lib/player-service";
import { PlayerSearch, RaceFilter, UnivFilter, RaceToggle, LiveToggle, SmartStickyHeader } from "@/components/players/Filters";
import Link from "next/link";
import { normalizeTier, normalizeRace } from "@/lib/utils";
import type { Player } from "@/types";

export const revalidate = 300;

const RACE_ORDER: Record<string, number> = {
  T: 0,
  Z: 1,
  P: 2,
};

function sortTierPlayers(players: Player[]) {
  return [...players].sort((left, right) => {
    const leftRace = normalizeRace(left.race);
    const rightRace = normalizeRace(right.race);
    const leftOrder = RACE_ORDER[leftRace] ?? 99;
    const rightOrder = RACE_ORDER[rightRace] ?? 99;
    if (leftOrder !== rightOrder) return leftOrder - rightOrder;
    return String(left.name || "").localeCompare(String(right.name || ""), "ko");
  });
}

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
  const allPlayers = await playerService.getCachedPlayersList();
  let playerList = [...allPlayers];

  // Multi-Filter Logic (Intersection)
  if (liveOnly) {
    playerList = playerList.filter(p => p.is_live);
  }
  if (race && race !== 'ALL') {
    playerList = playerList.filter(p => p.race === race);
  }
  if (univ && univ !== 'ALL') {
    playerList = playerList.filter(p => p.university === univ);
  }
  if (tier && tier !== 'ALL') {
    playerList = playerList.filter(p => normalizeTier(p.tier) === normalizeTier(tier));
  }

  // 대표님 UX 오더: 검색 과정 중(특히 한글 자모음 합성 등) 결과가 0명이 되는 순간 
  // 텅 빈 화면이 나오는 것을 방지하기 위해, 검색 결과가 있을 때만 리스트를 갱신하고
  // 없을 때는 기존의 꽉 찬 리스트를 유지.
  if (search) {
    const lowerSearch = search.toLowerCase();
    const searchedList = playerList.filter(p => p.name.toLowerCase().includes(lowerSearch));
    if (searchedList.length > 0) {
      playerList = searchedList;
    }
  }

  // 티어별 그룹화 로직 (정규화된 값 기준)
  const godPlayers = sortTierPlayers(playerList.filter(p => normalizeTier(p.tier) === '갓'));
  const kingPlayers = sortTierPlayers(playerList.filter(p => normalizeTier(p.tier) === '킹'));
  const jackPlayers = sortTierPlayers(playerList.filter(p => normalizeTier(p.tier) === '잭'));
  const jokerPlayers = sortTierPlayers(playerList.filter(p => normalizeTier(p.tier) === '조커'));
  const spadePlayers = sortTierPlayers(playerList.filter(p => normalizeTier(p.tier) === '스페이드'));
  
  // 0~8티어 세분화
  const numericTiers = [0, 1, 2, 3, 4, 5, 6, 7, 8];
  const numericTierGroups = numericTiers.map(t => ({
    tier: t,
    name: `${t}티어`,
    players: sortTierPlayers(playerList.filter(p => normalizeTier(p.tier) === String(t)))
  })).filter(group => group.players.length > 0);

  const babyPlayers = sortTierPlayers(playerList.filter(p => normalizeTier(p.tier) === '베이비'));

  const tiers = [
    { id: 'god', name: '갓' },
    { id: 'king', name: '킹' },
    { id: 'jack', name: '잭' },
    { id: 'joker', name: '조커' },
    { id: 'spade', name: '스페이드' },
    ...numericTiers.map(t => ({ id: String(t), name: `${t}티어` })),
    { id: 'baby', name: '베이비' },
  ];

  const hasResults = playerList.length > 0;

  return (
    <div className="min-h-screen flex flex-col bg-background">
      <H2HSelectorBar />

      <main className="flex-1 max-w-[1800px] mx-auto w-full px-4 lg:px-8 pb-8 fade-in relative">
        <div className="flex flex-col lg:flex-row gap-8">
          {/* 메인 리스트 영역 */}
          <div className="flex-1 min-w-0 flex flex-col">
            {/* Sticky 통합 필터바 (최상단 고정 및 간격 제거) */}
            <SmartStickyHeader>
              <div className="bg-background/95 backdrop-blur-xl border-b border-white/10 p-3 lg:p-4 -mx-4 lg:-mx-8 px-4 lg:px-8 mb-8 flex flex-col md:flex-row items-start md:items-center justify-between gap-4 shadow-lg shadow-black/20">
                <div className="w-full md:w-64 max-w-md">
                  <PlayerSearch playerNames={allPlayers.map((p: Player) => p.name)} />
                </div>
                <div className="flex items-center gap-4 w-full md:w-auto justify-end overflow-x-auto hide-scrollbar shrink-0">
                  <LiveToggle />
                  <RaceToggle />
                </div>
              </div>
            </SmartStickyHeader>

            <div className="flex flex-col gap-10 mb-12 border-b border-foreground/5 pb-10">
               <div className="flex flex-col gap-6">
                 <UnivFilter />
               </div>
            </div>

            {!hasResults ? (
              <div className="py-32 text-center bg-foreground/[0.02] rounded-3xl border border-dashed border-foreground/10">
                 <div className="text-4xl mb-6 opacity-30">🕵️‍♂️</div>
                 <h2 className="text-xl font-bold mb-2 text-foreground">찾으시는 선수가 없습니다</h2>
                 <p className="text-sm text-foreground/40 mb-8">검색어 혹은 필터를 변경해 보시겠습니까?</p>
                 <Link href="/tier" className="px-10 py-4 bg-nzu-green text-black rounded-xl text-xs font-black uppercase tracking-widest shadow-lg shadow-nzu-green/20 transition-colors">초기화하기</Link>
              </div>
            ) : (
              <div className="space-y-16">
                {godPlayers.length > 0 && (
                  <div id="tier-god">
                    <TierGroup rankName="갓" players={godPlayers} startIndex={0} showRaceGroups={params.raceToggle === "true"} />
                  </div>
                )}
                {kingPlayers.length > 0 && (
                  <div id="tier-king">
                    <TierGroup rankName="킹" players={kingPlayers} startIndex={godPlayers.length} showRaceGroups={params.raceToggle === "true"} />
                  </div>
                )}
                {jackPlayers.length > 0 && (
                  <div id="tier-jack">
                    <TierGroup rankName="잭" players={jackPlayers} startIndex={godPlayers.length + kingPlayers.length} showRaceGroups={params.raceToggle === "true"} />
                  </div>
                )}
                {jokerPlayers.length > 0 && (
                  <div id="tier-joker">
                    <TierGroup rankName="조커" players={jokerPlayers} startIndex={godPlayers.length + kingPlayers.length + jackPlayers.length} showRaceGroups={params.raceToggle === "true"} />
                  </div>
                )}
                
                {spadePlayers.length > 0 && (
                  <div id="tier-spade">
                    <TierGroup rankName="스페이드" players={spadePlayers} startIndex={godPlayers.length + kingPlayers.length + jackPlayers.length + jokerPlayers.length} showRaceGroups={params.raceToggle === "true"} />
                  </div>
                )}
                
                {/* 0~8티어 세분화 리스트 */}
                {numericTierGroups.map((group, idx) => {
                  const prevCount = godPlayers.length + kingPlayers.length + jackPlayers.length + jokerPlayers.length + spadePlayers.length + 
                    numericTierGroups.slice(0, idx).reduce((acc, curr) => acc + curr.players.length, 0);
                  
                  return (
                    <div key={group.tier} id={`tier-${group.tier}`}>
                      <TierGroup 
                        rankName={group.name} 
                        players={group.players} 
                        startIndex={prevCount} 
                        showRaceGroups={params.raceToggle === "true"}
                      />
                    </div>
                  );
                })}

                {babyPlayers.length > 0 && (
                  <div id="tier-baby">
                    <TierGroup 
                      rankName="베이비" 
                      players={babyPlayers} 
                      startIndex={playerList.length - babyPlayers.length}
                      showRaceGroups={params.raceToggle === "true"}
                      emptyMessage="베이비 티어 선수가 아직 등록되지 않았습니다"
                    />
                  </div>
                )}
              </div>
            )}
          </div>

          {/* Right Sticky Sidebar (Tier Navigation) */}
          <div className="hidden lg:block relative w-16">
            <div className="sticky top-72 z-50 flex justify-end">
              <div className="group relative flex flex-col items-center w-full">
                {/* Default State: Vertical Label */}
                <div className="bg-nzu-green/[0.08] backdrop-blur-md border border-nzu-green/30 px-4 py-8 rounded-2xl shadow-[0_0_24px_rgba(46,213,115,0.12)] vertical-rl text-[17px] font-[1000] tracking-[0.12em] text-nzu-green/95 cursor-pointer group-hover:opacity-0 group-hover:scale-95 transition-all duration-300 z-10 flex items-center justify-center text-center">
                  티어 목록
                </div>

                {/* Hover State: Vertically Centered Expansion - Compact for NO scroll */}
                <div className="absolute top-0 right-0 w-28 translate-y-[-36%] bg-[#0b1510]/95 backdrop-blur-xl border border-nzu-green/35 rounded-2xl shadow-[0_0_28px_rgba(46,213,115,0.14)] overflow-hidden opacity-0 scale-95 pointer-events-none group-hover:opacity-100 group-hover:scale-100 group-hover:pointer-events-auto transition-all duration-300 z-20">
                  <div className="p-2.5 border-b border-nzu-green/15 bg-nzu-green/[0.12]">
                    <p className="text-[12px] font-[1000] text-nzu-green tracking-[0.18em] text-center">
                      티어 목록
                    </p>
                  </div>
                  <div className="flex flex-col p-1.5">
                    {tiers.map((tier) => (
                      <a
                        key={tier.id}
                        href={`#tier-${tier.id}`}
                        className="px-3 py-2 rounded-lg text-[14px] font-black text-foreground/75 hover:text-black hover:bg-nzu-green transition-all text-center tracking-tight"
                      >
                        {tier.name}
                      </a>
                    ))}
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </main>

      {/* Footer Attribution */}
      <footer className="py-12 border-t border-white/5 relative z-10">
        <div className="max-w-[1800px] mx-auto px-16 flex flex-col md:flex-row justify-between items-center gap-6">
          <div className="flex flex-col gap-1 items-center md:items-start text-center md:text-left">
            <span className="text-[13px] font-black text-nzu-green uppercase tracking-widest transition-colors mb-2">
              티어표 출처: HOSAGA ARCHIVE
            </span>
            <p className="text-[10px] text-foreground/30 font-bold uppercase tracking-[0.2em]">
              © 2026 HOSAGA UNIVERSITY. 모든 권리 보유.
            </p>
          </div>
          
          <div className="flex items-center gap-8">
            <div className="flex flex-col items-end gap-1">
              <span className="text-[10px] font-black text-foreground/40 tracking-widest">구동</span>
              <span className="text-sm font-black text-foreground tracking-tighter transition-colors">HOSAGA 아카이브 엔진</span>
            </div>
          </div>
        </div>
      </footer>
    </div>
  );
}
