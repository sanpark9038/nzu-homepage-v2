
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
    <div className="min-h-screen flex flex-col bg-[#020403]">
      <Navbar />
      
      <main className="flex-1 max-w-[1800px] mx-auto w-full px-8 py-10 md:py-16 fade-in">
        <div className="mb-14">
          <h1 className="text-5xl md:text-7xl font-black tracking-tighter mb-4 uppercase leading-none text-white">선수 <span className="text-nzu-green">명단</span></h1>
          <p className="text-white/40 text-lg font-medium tracking-tight">늪지대 클랜 정식 멤버 아카이브</p>
        </div>

        {/* === 인터랙티브 필터 바 (고정형) === */}
        <div className="sticky top-20 z-40 bg-[#020403]/90 backdrop-blur-xl py-8 border-b border-white/5 mb-14">
          <div className="flex flex-col md:flex-row items-center justify-between gap-8">
             <div className="flex items-center gap-10">
                <PlayerSearch />
                <RaceFilter />
             </div>
             <div className="hidden xl:flex items-center gap-10">
                <div className="flex flex-col md:items-end">
                   <span className="text-[11px] font-black text-white/20 uppercase tracking-[0.3em]">등록 현황</span>
                   <span className="text-sm font-black text-nzu-green uppercase tracking-[0.2em]">활성 인원 {players.length}명</span>
                </div>
             </div>
          </div>
        </div>

        {!hasResults ? (
          <div className="py-32 text-center bg-white/[0.02] rounded-3xl border border-dashed border-white/10">
             <div className="text-4xl mb-6 opacity-30">📂</div>
             <h2 className="text-xl font-bold mb-2 text-white">선수 정보를 찾을 수 없습니다</h2>
             <p className="text-sm text-white/40 mb-8">다른 이름으로 검색해 보시겠습니까?</p>
             <Link href="/players" className="px-10 py-4 bg-nzu-green text-black rounded-xl text-xs font-black uppercase tracking-widest shadow-lg shadow-nzu-green/20">목록 전체 보기</Link>
          </div>
        ) : (
          <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 xl:grid-cols-7 2xl:grid-cols-8 gap-6 md:gap-8">
            {players.map((player) => (
              <PlayerCard key={player.id} player={player} />
            ))}
          </div>
        )}
      </main>

      <footer className="border-t border-white/5 py-16 bg-black/40 backdrop-blur-md mt-24">
          <div className="max-w-[1400px] mx-auto px-8 flex flex-col md:flex-row items-center justify-between gap-12">
              <div className="flex items-center gap-3 text-xs text-white/40 font-bold tracking-tighter uppercase">
                <span className="w-2 h-2 rounded-full bg-nzu-green shadow-[0_0_10px_#2ed573]" />
                늪지대 정식 멤버 명표
              </div>
              <div className="text-[10px] text-white/20 text-center md:text-right font-black uppercase tracking-widest">
                © 2025 NZU · 늪지대 유니버시티 아카이브 시스템<br/>
                <span className="text-nzu-green/40">산박 대표님의 부장, 엘레이드박 설계</span>
              </div>
          </div>
      </footer>
    </div>
  );
}
