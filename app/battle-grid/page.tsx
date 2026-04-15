
import Navbar from "@/components/Navbar";
import { BattleGrid } from "@/components/battle-grid/BattleGrid";
import { playerService } from "@/lib/player-service";
import { UNIVERSITY_MAP } from "@/lib/university-config";
import Link from "next/link";

export const revalidate = 60;

export default async function BattleGridPage({
  searchParams,
}: {
  searchParams: { teamA?: string; teamB?: string };
}) {
  const players = await playerService.getAllPlayers();
  const universities = Object.keys(UNIVERSITY_MAP);

  const { teamA, teamB } = searchParams;

  return (
    <div className="min-h-screen flex flex-col bg-background text-foreground">
      <Navbar />
      
      <main className="flex-1 max-w-7xl mx-auto w-full px-4 py-8 fade-in">
        <div className="flex flex-col md:flex-row md:items-end justify-between gap-6 mb-10">
          <div>
            <h1 className="text-3xl font-black tracking-tight mb-2 uppercase italic">Battle Grid</h1>
            <p className="text-muted-foreground text-sm font-medium">Mirror Arena: 두 대학의 전력을 티어별로 비교합니다.</p>
          </div>
        </div>

        <BattleGrid 
          players={players} 
          universities={universities}
          initialTeamA={teamA}
          initialTeamB={teamB}
        />
      </main>

      <footer className="border-t border-border/40 py-8 bg-card/30 mt-auto">
        <div className="max-w-7xl mx-auto px-4 flex flex-col md:flex-row items-center justify-between gap-4">
            <div className="flex items-center gap-2 text-xs text-muted-foreground uppercase font-bold tracking-tighter">
              <span className="w-2 h-2 rounded-full bg-nzu-green animate-pulse" />
              The Battle Grid: Mirror Arena
            </div>
            <div className="text-xs text-muted-foreground text-center md:text-right">
              © 2025 호사가 HOSAGA · Presented by Sanpark CEO<br/>
              <span className="opacity-60">Architected by El-Rade Park</span>
            </div>
        </div>
      </footer>
    </div>
  );
}
