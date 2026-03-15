
import Navbar from "@/components/Navbar";
import { playerService } from "@/lib/player-service";
import { format } from "date-fns";
import H2HLookup from "@/components/stats/H2HLookup";
import { cn } from "@/lib/utils";

export const revalidate = 60;

export const metadata = {
  title: "엔트리 전적 — NZU",
};

export default async function EntryPage() {
  const [matches, players] = await Promise.all([
    playerService.getRecentMatches(24),
    playerService.getAllPlayers()
  ]);

  return (
    <div className="min-h-screen flex flex-col bg-[#020403]">
      <Navbar />

      <main className="flex-1 w-full px-8 py-8 md:py-12 fade-in">
        {/* Header - Simple & Professional */}
        <header className="mb-8">
            <h1 className="text-xl md:text-2xl font-black tracking-tight text-white/90 mb-1">
              엔트리 매칭 엔진
            </h1>
            <p className="text-xs md:text-sm text-white/30 font-medium tracking-tight">
              실물 데이터를 기반으로 실시간 상대 전적 및 승률을 즉각 분석합니다.
            </p>
        </header>

        {/* Dashboard Section */}
        <div className="space-y-12">
          <section className="relative">
             <H2HLookup players={players} recentMatches={matches} />
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
