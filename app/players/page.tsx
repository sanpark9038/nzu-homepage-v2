
import Navbar from "@/components/Navbar";
import { PlayerCard } from "@/components/players/PlayerCard";
import { playerService } from "@/lib/player-service";
import { NZU_CONFIG } from "@/lib/constants";
import { PlayerSearch, RaceFilter } from "@/components/players/Filters";
import Link from "next/link";

export const revalidate = 60;

export default async function PlayersPage({
  searchParams,
}: {
  searchParams: { search?: string; race?: string };
}) {
  const { search, race } = await searchParams;
  let players = await playerService.getAllPlayers();

  if (search) {
    players = players.filter(p => p.name.includes(search));
  }
  if (race && race !== 'ALL') {
    players = players.filter(p => p.race === race);
  }

  const hasResults = players.length > 0;

  return (
    <div className="min-h-screen flex flex-col bg-background">
      <Navbar />
      
      <main className="flex-1 max-w-[1800px] mx-auto w-full px-8 py-10 fade-in">
        <div className="mb-14">
          <h1 className="text-5xl md:text-7xl font-black tracking-tighter mb-4 uppercase italic leading-none">Lineup</h1>
          <p className="text-muted-foreground/60 text-lg font-medium tracking-tight">늪지대 클랜 정식 멤버 아카이브</p>
        </div>

        {/* === Interactive Filter Bar (Sticky) === */}
        <div className="sticky top-20 z-40 bg-background/80 backdrop-blur-xl py-8 border-b border-white/5 mb-14">
          <div className="flex flex-col md:flex-row items-center justify-between gap-8">
             <div className="flex items-center gap-10">
                <PlayerSearch />
                <RaceFilter />
             </div>
             <div className="hidden xl:flex items-center gap-10">
                <div className="flex flex-col items-end">
                   <span className="text-[11px] font-black text-white/20 uppercase tracking-[0.3em]">등록 현황</span>
                   <span className="text-sm font-black text-nzu-green uppercase tracking-[0.2em]">활성 인원 {players.length}명</span>
                </div>
             </div>
          </div>
        </div>

        {!hasResults ? (
          <div className="py-32 text-center bg-card/10 rounded-3xl border border-dashed border-border/60">
             <div className="text-4xl mb-6 opacity-30">📂</div>
             <h2 className="text-xl font-bold mb-2">선수 정보를 찾을 수 없습니다</h2>
             <p className="text-sm text-muted-foreground mb-8">다른 이름으로 검색해 보시겠습니까?</p>
             <Link href="/players" className="px-6 py-2 bg-nzu-green rounded-lg text-sm font-bold shadow-lg shadow-nzu-green/20">목록 전체 보기</Link>
          </div>
        ) : (
          <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 xl:grid-cols-7 2xl:grid-cols-8 gap-6 md:gap-8">
            {players.map((player) => (
              <PlayerCard key={player.id} player={player} />
            ))}
          </div>
        )}
      </main>

      <footer className="border-t border-border/40 py-8 bg-card/30 mt-auto">
          <div className="max-w-6xl mx-auto px-4 flex flex-col md:flex-row items-center justify-between gap-4">
              <div className="flex items-center gap-2 text-xs text-muted-foreground uppercase font-bold tracking-tighter">
                <span className="w-2 h-2 rounded-full bg-nzu-green animate-pulse" />
                Member Registry
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
