
import { TierGroup } from "@/components/players/TierGroup";
import { PlayerCard } from "@/components/players/PlayerCard";
import { H2HSelectorBar } from "@/components/players/H2HSelectorBar";
import { playerService } from "@/lib/player-service";
import { NZU_CONFIG } from "@/lib/constants";
import { PlayerSearch, RaceFilter, UnivFilter, RaceToggle } from "@/components/players/Filters";
import Link from "next/link";
import { normalizeTier } from "@/lib/utils";
import type { Player } from "@/types";

const RACE_ORDER: Record<string, number> = {
  T: 0,
  Z: 1,
  P: 2,
};

function normalizeRaceCode(value: string | null | undefined) {
  const raw = String(value || "").trim().toUpperCase();
  if (raw.startsWith("T")) return "T";
  if (raw.startsWith("Z")) return "Z";
  if (raw.startsWith("P")) return "P";
  return raw;
}

function sortTierPlayers(players: Player[]) {
  return [...players].sort((left, right) => {
    const leftRace = normalizeRaceCode(left.race);
    const rightRace = normalizeRaceCode(right.race);
    const leftOrder = RACE_ORDER[leftRace] ?? 99;
    const rightOrder = RACE_ORDER[rightRace] ?? 99;
    if (leftOrder !== rightOrder) return leftOrder - rightOrder;
    return String(left.name || "").localeCompare(String(right.name || ""), "ko");
  });
}

export default async function TierPage({
  searchParams,
}: {
  searchParams: { search?: string; race?: string; univ?: string; tier?: string; raceToggle?: string };
}) {
  const params = await searchParams;
  const search = params.search;
  const race = params.race;
  const univ = params.univ;
  const tier = params.tier;
  
  let playerList = await playerService.getAllPlayers();

  // Multi-Filter Logic (Intersection)
  if (search) {
    playerList = playerList.filter(p => p.name.includes(search));
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
    { id: 'queen', name: '퀸' },
    { id: 'joker', name: '조커' },
    { id: 'spade', name: '스페이드' },
    ...numericTiers.map(t => ({ id: String(t), name: `${t}티어` })),
    { id: 'baby', name: '베이비' },
  ];

  const hasResults = playerList.length > 0;

  return (
    <div className="min-h-screen flex flex-col bg-background">
      <H2HSelectorBar />

      <main className="flex-1 max-w-[1800px] mx-auto w-full px-4 lg:px-8 py-8 fade-in relative">
        <div className="flex flex-col lg:flex-row gap-8">
          {/* 메인 리스트 영역 */}
          <div className="flex-1 min-w-0">
            <div className="flex flex-col gap-10 mb-12 border-b border-foreground/5 pb-10">
               <div className="flex flex-col gap-8">
                  <div className="flex flex-col md:flex-row items-start md:items-center gap-6">
                    <div className="max-w-md w-full">
                      <PlayerSearch />
                    </div>
                    <RaceToggle />
                  </div>
                  <div className="flex flex-col gap-6">
                    <UnivFilter />
                  </div>
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

                {/* 베이비 티어 (데이터가 없을 때도 섹션 유지를 원할 경우 필터 없이 항상 노출 가능하지만, 여기서는 데이터가 있을 때 확실히 노출되도록 보장) */}
                <div id="tier-baby">
                  <TierGroup 
                    rankName="베이비" 
                    players={babyPlayers} 
                    startIndex={playerList.length - babyPlayers.length}
                    showRaceGroups={params.raceToggle === "true"}
                    emptyMessage="베이비 티어 선수가 아직 등록되지 않았습니다"
                  />
                </div>
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
              티어표 출처: NZU ARCHIVE
            </span>
            <p className="text-[10px] text-foreground/30 font-bold uppercase tracking-[0.2em]">
              © 2026 NZU UNIVERSITY. 모든 권리 보유.
            </p>
          </div>
          
          <div className="flex items-center gap-8">
            <div className="flex flex-col items-end gap-1">
              <span className="text-[10px] font-black text-foreground/40 tracking-widest">구동</span>
              <span className="text-sm font-black text-foreground tracking-tighter transition-colors">NZU 아카이브 엔진</span>
            </div>
          </div>
        </div>
      </footer>
    </div>
  );
}
