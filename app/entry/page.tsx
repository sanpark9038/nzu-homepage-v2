
import { playerService } from "@/lib/player-service";
import { format } from "date-fns";
import H2HLookup from "@/components/stats/H2HLookup";
import { cn } from "@/lib/utils";

import RecentEloMatches from "@/components/stats/RecentEloMatches";

export const revalidate = 60;

export const metadata = {
  title: "엔트리 전적 — HOSAGA",
};

export default async function EntryPage() {
  const [matches, eloMatches, players] = await Promise.all([
    playerService.getRecentMatches(24),
    playerService.getRecentEloMatches(12),
    playerService.getAllPlayers()
  ]);

  return (
    <div className="min-h-screen flex flex-col bg-background">
      <main className="flex-1 max-w-[1800px] mx-auto w-full px-8 pt-4 md:pt-6 fade-in">
        {/* === Tactical Entry Header (컴팩트 고밀도 개편) === */}
        <header className="mb-8 flex flex-col md:flex-row md:items-end justify-between gap-6 border-b border-white/5 pb-6">
          <div className="space-y-4">
            <div className="flex items-center gap-2 mb-2">
              <div className="w-2 h-2 rounded-full bg-nzu-green/40 shadow-[0_0_8px_rgba(46,213,115,0.2)]" />
              <span className="text-sm font-bold text-nzu-green/80">데이터 분석 모듈 활성</span>
            </div>
            <div className="flex flex-col gap-2">
              <h1 className="text-4xl md:text-5xl font-black text-white tracking-tight">엔트리 분석 엔진</h1>
              <p className="text-sm font-bold text-muted-foreground">상대 팀 분석 및 최적의 매치업을 구성하세요</p>
            </div>
          </div>

          <div className="flex flex-col md:items-end gap-1">
            <p className="text-[11px] text-white/10 font-black uppercase tracking-widest leading-none mb-1">DATA INFRASTRUCTURE ENABLED</p>
            <p className="text-xs text-white/30 font-bold uppercase tracking-tight">
              REAL-TIME <span className="text-nzu-green/40">OPTIMIZATION ENGINE</span> FOR COMPETITIVE ROSTERS
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
                    <span className="text-[10px] text-nzu-green font-black tracking-[0.5em] uppercase leading-none">HOSAGA 코어 시스템</span>
                 </div>
                 <p className="text-[10px] text-white/20 font-bold uppercase tracking-widest leading-none ml-5">데이터 인프라 가동 중</p>
              </div>
              <div className="flex flex-col items-center md:items-end gap-2 text-[10px] font-black uppercase tracking-[0.2em] text-white/20">
                <p>© 2025 HOSAGA · 글로벌 아카이브 모듈</p>
                <p className="text-nzu-green/40">산박 대표님을 위한 박부장의 명품 설계</p>
              </div>
          </div>
      </footer>
    </div>
  );
}
