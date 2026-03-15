
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
      
      <main className="flex-1 max-w-6xl mx-auto w-full px-4 py-8 fade-in">
        <div className="flex flex-col md:flex-row md:items-end justify-between gap-6 mb-10">
          <div>
            <h1 className="text-3xl font-black tracking-tight mb-2 uppercase italic">Lineup</h1>
            <p className="text-muted-foreground text-sm font-medium">늪지대 클랜의 모든 정식 멤버 정보</p>
          </div>

          <div className="flex flex-col sm:flex-row items-center gap-3">
             <PlayerSearch />
             <RaceFilter />
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
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 gap-4">
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
