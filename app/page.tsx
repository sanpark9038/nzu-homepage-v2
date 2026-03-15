
import Navbar from "@/components/Navbar";
import { PlayerCard } from "@/components/players/PlayerCard";
import { StatCounter } from "@/components/ui/nzu-badges";
import { playerService } from "@/lib/player-service";
import { NZU_CONFIG } from "@/lib/constants";
import Link from "next/link";
import { format } from "date-fns";

export const revalidate = 60;

export default async function HomePage() {
  const players = await playerService.getAllPlayers();
  const recentMatches = await playerService.getRecentMatches(3);
  const livePlayers = players.filter((p) => p.is_live);
  
  // 티어별 주요 선수들 (상위 6명만)
  const topRankers = players
    .filter(p => ['god', 'king'].includes(p.tier))
    .slice(0, 6);

  return (
    <div className="min-h-screen flex flex-col bg-background">
      <Navbar />

      <main className="flex-1 fade-in">
        {/* === Grand Hero Section === */}
        <section className="relative overflow-hidden pt-20 pb-24 border-b border-border/40">
          <div className="absolute inset-0 pointer-events-none">
            <div className="absolute top-0 left-1/2 -translate-x-1/2 w-[800px] h-[400px] bg-nzu-green/10 rounded-full blur-[120px]" />
            <div className="absolute bottom-0 right-0 w-[400px] h-[400px] bg-nzu-gold/5 rounded-full blur-[100px]" />
          </div>

          <div className="max-w-6xl mx-auto px-4 relative">
            <div className="text-center space-y-6">
              <div className="inline-flex items-center gap-2 text-[10px] font-black tracking-[0.3em] text-nzu-green uppercase border border-nzu-green/30 rounded-full px-4 py-1.5 mb-4 bg-nzu-green/5">
                <span className="w-1.5 h-1.5 rounded-full bg-nzu-green live-dot" />
                The Elite Force of Starcraft
              </div>

              <h1 className="text-6xl md:text-8xl font-black tracking-tighter uppercase italic leading-[0.9]">
                <span className="text-foreground">늪지대</span><br/>
                <span className="gradient-text italic">NEW ZEALAND UNIVERSITY</span>
              </h1>

              <p className="text-muted-foreground text-lg md:text-xl max-w-xl mx-auto font-medium leading-relaxed">
                승리를 향한 끊임없는 진화. <br className="hidden md:block" />
                숲 스타크래프트 대학대전 NZU 공식 아카이빙 플랫폼.
              </p>

              <div className="flex items-center justify-center gap-4 pt-6">
                <Link
                  href="/tier"
                  className="px-8 py-4 bg-nzu-green text-white text-sm font-black uppercase tracking-widest rounded-2xl hover:bg-nzu-green-dim transition-all shadow-xl shadow-nzu-green/20 hover:-translate-y-1"
                >
                  View Tier List
                </Link>
                <Link
                  href="/players"
                  className="px-8 py-4 bg-card border border-border/60 text-sm font-black uppercase tracking-widest text-foreground/80 rounded-2xl hover:border-nzu-green/40 hover:text-foreground transition-all hover:-translate-y-1"
                >
                  The Roster
                </Link>
              </div>
            </div>
          </div>
        </section>

        {/* === Stats Briefing === */}
        <section className="max-w-6xl mx-auto px-4 -mt-10 mb-20 relative z-10">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <StatCounter icon="👥" value={players.length} label="Total Members" />
            <StatCounter icon="📡" value={livePlayers.length} label="Live Now" />
            <StatCounter icon="⚔️" value="Season 1" label="Active Season" />
            <div className="flex items-center gap-4 bg-card rounded-2xl border border-nzu-green/30 px-6 py-4 shadow-xl">
               <div className="w-10 h-10 rounded-full bg-nzu-green/10 flex items-center justify-center text-xl">🏆</div>
               <div className="flex-1">
                  <div className="text-xs text-muted-foreground uppercase font-black tracking-widest">Team Rank</div>
                  <div className="text-lg font-black italic text-nzu-green">CHAMPION</div>
               </div>
            </div>
          </div>
        </section>

        <div className="max-w-6xl mx-auto px-4 grid grid-cols-1 lg:grid-cols-12 gap-12 pb-24">
          
          {/* Left Column: Spotlight & Live */}
          <div className="lg:col-span-8 space-y-16">
            
            {/* LIVE Section */}
            {livePlayers.length > 0 && (
              <section>
                <div className="flex items-center gap-3 mb-6">
                  <h2 className="text-sm font-black text-foreground uppercase tracking-[0.2em]">Live Streamers</h2>
                  <div className="flex-1 h-px bg-border/40" />
                  <span className="text-[10px] font-bold text-nzu-live animate-pulse">ON AIR</span>
                </div>
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-4">
                  {livePlayers.map((player) => (
                    <PlayerCard key={player.id} player={player} />
                  ))}
                </div>
              </section>
            )}

            {/* Top Rankers Section */}
            <section>
              <div className="flex items-center gap-3 mb-6">
                <h2 className="text-sm font-black text-foreground uppercase tracking-[0.2em]">The Elite Gods</h2>
                <div className="flex-1 h-px bg-border/40" />
                <Link href="/tier" className="text-[10px] font-black text-nzu-green hover:underline">VIEW ALL</Link>
              </div>
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-6">
                {topRankers.map((player) => (
                  <div key={player.id} className="group relative">
                     <PlayerCard player={player} />
                     <div className="absolute -top-2 -left-2 w-8 h-8 bg-nzu-gold rounded-full flex items-center justify-center text-black font-black text-xs shadow-lg shadow-nzu-gold/30 z-10 border-2 border-background">
                        ⭐
                     </div>
                  </div>
                ))}
              </div>
            </section>
          </div>

          {/* Right Column: Recent Briefing */}
          <div className="lg:col-span-4">
            <section className="bg-card border border-border/40 rounded-[2.5rem] p-8 sticky top-24">
               <div className="flex items-center justify-between mb-8">
                  <h2 className="text-xs font-black uppercase tracking-widest">Match Brief</h2>
                  <Link href="/entry" className="text-[10px] font-bold text-muted-foreground hover:text-nzu-green">HISTORY →</Link>
               </div>
               
               <div className="space-y-6">
                  {recentMatches.length === 0 ? (
                    <p className="text-xs text-muted-foreground text-center py-12 italic">No recent matches recorded.</p>
                  ) : (
                    recentMatches.map((match: any) => (
                      <div key={match.id} className="space-y-3">
                         <div className="flex items-center justify-between text-[8px] font-black text-muted-foreground uppercase opacity-60">
                            <span>{match.event_name}</span>
                            <span>{match.match_date ? format(new Date(match.match_date), 'MM.dd') : ''}</span>
                         </div>
                         <div className="flex items-center justify-center gap-3">
                            <span className={`text-[11px] font-black uppercase ${match.winner_id === match.player1_id ? 'text-nzu-green underline decoration-2 underline-offset-4' : 'text-muted-foreground'}`}>{match.player1.name}</span>
                            <span className="text-[9px] font-black text-muted-foreground italic">VS</span>
                            <span className={`text-[11px] font-black uppercase ${match.winner_id === match.player2_id ? 'text-nzu-green underline decoration-2 underline-offset-4' : 'text-muted-foreground'}`}>{match.player2.name}</span>
                         </div>
                         <div className="h-px bg-border/20" />
                      </div>
                    ))
                  )}
               </div>
               
               <div className="mt-12">
                  <div className="p-4 bg-muted/5 rounded-2xl border border-border/40 text-center">
                     <p className="text-[10px] text-muted-foreground mb-3 font-medium">Join the NZU Community</p>
                     <button className="w-full py-2 bg-foreground text-background text-[10px] font-black uppercase tracking-widest rounded-xl hover:bg-nzu-green hover:text-white transition-colors">Apply Now</button>
                  </div>
               </div>
            </section>
          </div>
        </div>
      </main>

      <footer className="border-t border-border/40 py-12 bg-card/50">
          <div className="max-w-6xl mx-auto px-4">
              <div className="flex flex-col md:flex-row items-center justify-between gap-8 mb-12">
                 <Link href="/" className="flex items-center gap-2">
                    <div className="w-8 h-8 rounded-lg bg-nzu-green flex items-center justify-center text-sm font-black text-white">N</div>
                    <span className="font-black tracking-widest uppercase text-base">늪지대 <span className="text-nzu-green">NZU</span></span>
                 </Link>
                 <nav className="flex items-center gap-8 text-[10px] font-black uppercase tracking-widest text-muted-foreground">
                    <Link href="/tier" className="hover:text-nzu-green transition-colors">Tiers</Link>
                    <Link href="/entry" className="hover:text-nzu-green transition-colors">Records</Link>
                    <Link href="/live" className="hover:text-nzu-green transition-colors">Live</Link>
                    <Link href="/players" className="hover:text-nzu-green transition-colors">Roster</Link>
                 </nav>
              </div>
              <div className="flex flex-col md:flex-row items-center justify-between gap-4 pt-8 border-t border-border/10">
                 <p className="text-[10px] text-muted-foreground/60 font-medium tracking-wide italic">© 2025 NEW ZEALAND UNIVERSITY. ALL RIGHTS RESERVED.</p>
                 <p className="text-[10px] text-muted-foreground/40 font-black tracking-widest uppercase">Architected by El-Rade Park</p>
              </div>
          </div>
      </footer>
    </div>
  );
}
