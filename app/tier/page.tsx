
import Navbar from "@/components/Navbar";
import { TierGroup } from "@/components/players/TierGroup";
import { PlayerRow } from "@/components/players/PlayerRow";
import { playerService } from "@/lib/player-service";
import { NZU_CONFIG } from "@/lib/constants";
import { PlayerSearch, RaceFilter } from "@/components/players/Filters";
import Link from "next/link";

export const revalidate = 60;

export default async function TierPage({
  searchParams,
}: {
  searchParams: { search?: string; race?: string };
}) {
  const { search, race } = await searchParams;
  let playerList = await playerService.getAllPlayers();

  // 필터링 적용
  if (search) {
    playerList = playerList.filter(p => p.name.includes(search));
  }
  if (race && race !== 'ALL') {
    playerList = playerList.filter(p => p.race === race);
  }

  // 티어별 그룹화 로직
  const godPlayers = playerList.filter(p => p.tier === 'god');
  const kingPlayers = playerList.filter(p => p.tier === 'king');
  const jackPlayers = playerList.filter(p => p.tier === 'jack');
  const jokerPlayers = playerList.filter(p => p.tier === 'joker');
  const numberedPlayers = playerList.filter(p => !isNaN(Number(p.tier))).sort((a, b) => Number(a.tier) - Number(b.tier));

  const hasResults = playerList.length > 0;

  return (
    <div className="min-h-screen flex flex-col">
      <Navbar />

      <main className="flex-1 max-w-[1600px] mx-auto w-full px-12 py-16 fade-in">
        {/* === Premium Header Section === */}
        <div className="flex flex-col md:flex-row md:items-end justify-between gap-10 mb-20 border-b border-white/5 pb-16 relative">
          <div className="absolute -left-20 top-0 w-40 h-40 bg-nzu-green/10 blur-[100px] rounded-full pointer-events-none" />
          
          <div className="relative z-10">
            <div className="flex items-center gap-3 mb-4">
               <span className="px-3 py-1 bg-nzu-green/10 text-nzu-green text-[10px] font-black uppercase tracking-widest rounded-md border border-nzu-green/20">
                 Live Archive
               </span>
               <span className="text-white/20 text-[10px] font-bold tracking-widest uppercase italic">Season 2025-Q1</span>
            </div>
            <h1 className="text-5xl md:text-7xl font-black tracking-tighter uppercase italic text-white leading-none mb-6">
              실시간 <span className="text-nzu-green">티어 랭킹</span>
            </h1>
            <p className="text-white/40 text-lg font-medium italic tracking-tight">
              NZU 통합 멤버들의 실시간 전적 및 ELO 기반 공식 티어표입니다.
            </p>
          </div>
          
          <div className="flex flex-col gap-6 relative z-10">
             <div className="flex items-center gap-6 text-right justify-end mb-2">
                <div className="flex flex-col">
                   <span className="text-[10px] font-black text-white/30 uppercase tracking-widest">Total Players</span>
                   <span className="text-2xl font-black text-white italic">{playerList.length} <span className="text-xs font-bold text-white/40 not-italic">명</span></span>
                </div>
                <div className="w-px h-8 bg-white/10" />
                <div className="flex flex-col text-nzu-green">
                   <span className="text-[10px] font-black opacity-60 uppercase tracking-widest">Active Live</span>
                   <span className="text-2xl font-black italic">{playerList.filter(p => p.is_live).length} <span className="text-xs font-bold opacity-60 not-italic">ON</span></span>
                </div>
             </div>
             
             <div className="flex flex-col sm:flex-row items-center gap-4 bg-white/[0.03] p-2 rounded-2xl border border-white/5 shadow-2xl backdrop-blur-sm">
                <PlayerSearch />
                <RaceFilter />
             </div>
          </div>
        </div>

        {!hasResults ? (
          <div className="py-32 text-center bg-card/10 rounded-3xl border border-dashed border-border/60">
             <div className="text-4xl mb-6 opacity-30">🕵️‍♂️</div>
             <h2 className="text-xl font-bold mb-2">찾으시는 선수가 없습니다</h2>
             <p className="text-sm text-muted-foreground mb-8">검색어 혹은 필터를 변경해 보시겠습니까?</p>
             <Link href="/tier" className="px-6 py-2 bg-nzu-green rounded-lg text-sm font-bold shadow-lg shadow-nzu-green/20 hover:bg-nzu-green-dim transition-colors">초기화하기</Link>
          </div>
        ) : (
          <div className="space-y-12">
            {godPlayers.length > 0 && <TierGroup rankName="The Gods" players={godPlayers} startIndex={0} />}
            {kingPlayers.length > 0 && <TierGroup rankName="The Kings" players={kingPlayers} startIndex={godPlayers.length} />}
            {(jackPlayers.length > 0 || jokerPlayers.length > 0) && (
              <TierGroup rankName="High Ranks" players={[...jackPlayers, ...jokerPlayers]} startIndex={godPlayers.length + kingPlayers.length} />
            )}
            
            {numberedPlayers.length > 0 && (
              <div className="mb-4">
                  <div className="flex items-center gap-3 mb-3 px-1">
                    <span className="text-sm font-black text-muted-foreground uppercase tracking-widest">Active Players</span>
                    <div className="flex-1 h-px bg-border/40" />
                  </div>
                  <div className="bg-card rounded-xl border border-border overflow-hidden shadow-xl shadow-black/20">
                    <div className="grid grid-cols-[3rem_2fr_1fr_1fr_1fr] px-4 py-3 border-b border-border/60 bg-muted/20 text-[9px] font-bold text-muted-foreground uppercase tracking-widest">
                      <span className="text-center">Rank</span>
                      <span>Member</span>
                      <span className="text-center">Winrate</span>
                      <span className="text-center">ELO (LP)</span>
                      <span className="text-right">Record</span>
                    </div>
                    <div className="divide-y divide-border/40">
                      {numberedPlayers.map((player, index) => (
                        <PlayerRow key={player.id} player={player} rank={godPlayers.length + kingPlayers.length + jackPlayers.length + jokerPlayers.length + index + 1} />
                      ))}
                    </div>
                  </div>
              </div>
            )}
          </div>
        )}
      </main>

      <footer className="border-t border-border/40 py-8 bg-card/30 mt-auto">
          <div className="max-w-6xl mx-auto px-4 flex flex-col md:flex-row items-center justify-between gap-4">
              <div className="flex items-center gap-2 text-xs text-muted-foreground uppercase font-bold tracking-tighter">
                <span className="w-2 h-2 rounded-full bg-nzu-green animate-pulse" />
                Live Sync Active
              </div>
              <div className="text-xs text-muted-foreground text-center md:text-right">
                © 2025 늪지대 NZU · 숲 스타크래프트 대학대전<br/>
                <span className="opacity-60">Architected by El-Rade Park</span>
              </div>
          </div>
      </footer>
    </div>
  );
}
