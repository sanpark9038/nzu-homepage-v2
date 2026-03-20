
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

      <main className="flex-1 max-w-[1800px] mx-auto w-full px-8 py-10 md:py-16 fade-in">
        {/* Compact Strategic Header */}
        <header className="mb-10 flex flex-col md:flex-row md:items-end justify-between gap-6 border-b border-white/5 pb-8">
          <div className="space-y-1">
            <div className="flex items-center gap-2 mb-2">
              <div className="w-2 h-2 rounded-full bg-nzu-green shadow-[0_0_10px_#2ed573] animate-pulse" />
              <span className="text-[10px] font-black text-nzu-green uppercase tracking-[0.4em]">Strategic Module Active</span>
            </div>
            <h1 className="text-4xl md:text-5xl font-black text-white italic uppercase tracking-tighter leading-none">
              Entry <span className="text-nzu-green">Engine</span>
            </h1>
          </div>
          <div className="flex flex-col md:items-end gap-1">
            <p className="text-[10px] text-white/20 font-black uppercase tracking-[0.3em]">Neural Infrastructure Active</p>
            <p className="text-sm text-white/40 font-bold italic">
              실시간 데이터 기반 <span className="text-nzu-green/60">최적 엔트리 설계 모듈</span>
            </p>
          </div>
        </header>

        {/* Dashboard Section - Entry Table First */}
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
                    <span className="text-[10px] text-nzu-green font-black tracking-[0.5em] uppercase leading-none">NZU Core System</span>
                 </div>
                 <p className="text-[10px] text-white/20 font-bold uppercase tracking-widest leading-none ml-5">Neural Infrastructure Active</p>
              </div>
              <div className="flex flex-col items-center md:items-end gap-2 text-[10px] font-black uppercase tracking-[0.2em] text-white/20">
                <p>© 2025 NZU · Global Archive Module</p>
                <p className="text-nzu-green/40 italic">Designed by CTO El-Rade Park for CEO Sanpark</p>
              </div>
          </div>
      </footer>
    </div>
  );
}
