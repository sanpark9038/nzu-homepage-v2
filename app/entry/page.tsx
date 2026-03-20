
import Navbar from "@/components/Navbar";
import { playerService } from "@/lib/player-service";
import { format } from "date-fns";
import H2HLookup from "@/components/stats/H2HLookup";
import { cn } from "@/lib/utils";

import RecentEloMatches from "@/components/stats/RecentEloMatches";

export const revalidate = 60;

export const metadata = {
  title: "엔트리 전적 — NZU",
};

export default async function EntryPage() {
  const [matches, eloMatches, players] = await Promise.all([
    playerService.getRecentMatches(24),
    playerService.getRecentEloMatches(12),
    playerService.getAllPlayers()
  ]);

  return (
    <div className="min-h-screen flex flex-col bg-[#020403]">
      <Navbar />



      <main className="flex-1 max-w-[1800px] mx-auto w-full px-8 pt-4 md:pt-6 fade-in">
        {/* 전략 헤더 섹션 */}
        <header className="mb-6 flex flex-col md:flex-row md:items-end justify-between gap-6 border-b border-white/5 pb-4">
          <div className="space-y-1">
            <div className="flex items-center gap-2 mb-2">
              <div className="w-2 h-2 rounded-full bg-nzu-green shadow-[0_0_10px_#2ed573] animate-pulse" />
              <span className="text-[10px] font-black text-nzu-green uppercase tracking-[0.4em]">전략 모듈 가동 중</span>
            </div>
            <h1 className="text-4xl md:text-5xl font-black text-white uppercase tracking-tighter leading-none">
              엔트리 <span className="text-nzu-green">분석 엔진</span>
            </h1>
          </div>
          <div className="flex flex-col md:items-end gap-1">
            <p className="text-[10px] text-white/20 font-black uppercase tracking-[0.3em]">데이터 인프라 활성화</p>
            <p className="text-sm text-white/40 font-bold">
              실시간 데이터 기반 <span className="text-nzu-green/60">최적 엔트리 설계 모듈</span>
            </p>
          </div>
        </header>

        {/* 대시보드 섹션 */}
        <div className="space-y-20">
          <section className="relative">
             <H2HLookup players={players} recentMatches={matches} />
          </section>

          <section className="pt-16 border-t border-white/5">
             <RecentEloMatches matches={eloMatches} />
          </section>
        </div>
      </main>

      <footer className="border-t border-white/5 py-16 bg-black/40 backdrop-blur-md mt-24">
          <div className="w-full px-8 flex flex-col md:flex-row items-center justify-between gap-12">
              <div className="flex flex-col gap-3">
                 <div className="flex items-center gap-3">
                    <div className="w-2 h-2 rounded-full bg-nzu-green shadow-[0_0_10px_#2ed573]" />
                    <span className="text-[10px] text-nzu-green font-black tracking-[0.5em] uppercase leading-none">NZU 코어 시스템</span>
                 </div>
                 <p className="text-[10px] text-white/20 font-bold uppercase tracking-widest leading-none ml-5">데이터 인프라 가동 중</p>
              </div>
              <div className="flex flex-col items-center md:items-end gap-2 text-[10px] font-black uppercase tracking-[0.2em] text-white/20">
                <p>© 2025 NZU · 글로벌 아카이브 모듈</p>
                <p className="text-nzu-green/40">산박 대표님을 위한 박부장의 명품 설계</p>
              </div>
          </div>
      </footer>
    </div>
  );
}
