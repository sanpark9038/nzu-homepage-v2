
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

      <main className="flex-1 max-w-6xl mx-auto w-full px-4 py-8 fade-in">
        <div className="flex flex-col md:flex-row md:items-end justify-between gap-6 mb-10">
          <div>
            <h1 className="text-3xl font-black tracking-tight mb-2 uppercase text-foreground">Tier List</h1>
            <p className="text-muted-foreground text-sm font-medium">NZU 통합 멤버 티어표 및 실시간 기록</p>
          </div>
          
          <div className="flex flex-col sm:flex-row items-center gap-3">
             <PlayerSearch />
             <RaceFilter />
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
