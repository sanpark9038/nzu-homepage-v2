
import Navbar from "@/components/Navbar";
import { playerService } from "@/lib/player-service";
import { NZU_CONFIG } from "@/lib/constants";
import Image from "next/image";
import Link from "next/link";
import { LiveBadge, RaceTag, type Race } from "@/components/ui/nzu-badges";

export const revalidate = 60;
type PlayerMatch = Awaited<ReturnType<typeof playerService.getPlayerMatches>>[number];

export async function generateMetadata({ params }: { params: { id: string } }) {
  const { id } = await params;
  const player = await playerService.getPlayerById(id);
  
  return {
    title: player ? `${player.name} - NZU Player Profile` : "Player Not Found",
    description: player?.nickname || `NZU Member ${player?.name}'s profile and match history.`,
  };
}

export default async function PlayerProfilePage({ params }: { params: { id: string } }) {
  const { id } = await params;
  const player = await playerService.getPlayerById(id);
  const matches = await playerService.getPlayerMatches(id);

  if (!player) {
    return (
      <div className="min-h-screen bg-background flex flex-col">
        <Navbar />
        <div className="flex-1 flex flex-col items-center justify-center p-4">
          <h1 className="text-2xl font-bold mb-4">선수를 찾을 수 없습니다</h1>
          <Link href="/tier" className="px-6 py-2 bg-nzu-green rounded-lg font-bold">돌아가기</Link>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background flex flex-col pb-20">
      <Navbar />

      <main className="flex-1 max-w-4xl mx-auto w-full px-4 pt-12">
        {/* 뒤로가기 브레드크럼 */}
        <Link href="/tier" className="flex items-center gap-2 text-muted-foreground hover:text-foreground text-xs font-bold mb-8 transition-colors group">
           <span className="group-hover:-translate-x-1 transition-transform">←</span> BACK TO ROSTER
        </Link>

        {/* 히로 섹션: 가볍고 명확하게 */}
        <section className="relative bg-card border border-border/40 rounded-[2.5rem] p-8 md:p-12 overflow-hidden mb-12">
          {/* 장식용 배경 */}
          <div className="absolute top-0 right-0 w-1/2 h-full bg-gradient-to-l from-nzu-green/5 to-transparent pointer-events-none" />
          
          <div className="relative flex flex-col md:flex-row items-center gap-10">
            <div className="relative w-40 h-40 md:w-48 md:h-48 rounded-full border-4 border-nzu-green/20 overflow-hidden shadow-2xl">
              <Image 
                src={player.photo_url || "/placeholder-player.png"} 
                alt={player.name} 
                fill 
                className="object-cover object-top"
              />
              {player.is_live && (
                <div className="absolute bottom-4 inset-x-0 flex justify-center">
                   <LiveBadge />
                </div>
              )}
            </div>

            <div className="flex-1 text-center md:text-left">
               <div className="flex flex-col md:flex-row items-center gap-4 mb-4">
                  <h1 className="text-4xl md:text-5xl font-black tracking-tighter uppercase">{player.name}</h1>
                  <RaceTag race={player.race as Race} />
               </div>
               
               <p className="text-muted-foreground text-lg font-medium mb-8">
                  {player.nickname || "NZU 아카데미 소속"}
               </p>

               <div className="grid grid-cols-3 gap-8 max-w-md mx-auto md:mx-0">
                  <div>
                     <span className="block text-[10px] text-muted-foreground font-black uppercase tracking-widest mb-1">Tier</span>
                     <span className="text-xl font-black text-nzu-green uppercase italic">{player.tier}</span>
                  </div>
                  <div>
                     <span className="block text-[10px] text-muted-foreground font-black uppercase tracking-widest mb-1">Elo Point</span>
                     <span className="text-xl font-black text-foreground italic">{player.elo_point?.toLocaleString() ?? '0'} LP</span>
                  </div>
                  <div>
                     <span className="block text-[10px] text-muted-foreground font-black uppercase tracking-widest mb-1">Win Rate</span>
                     <span className="text-xl font-black text-foreground italic">{player.win_rate ? `${player.win_rate}%` : '-'}</span>
                  </div>
               </div>
            </div>
          </div>
        </section>

        {/* 전적 리스트: 심플 & 가독성 */}
        <section>
          <div className="flex items-center gap-4 mb-6">
             <h2 className="text-sm font-black text-muted-foreground tracking-[0.2em] uppercase whitespace-nowrap">Match History</h2>
             <div className="flex-1 h-px bg-border/40" />
          </div>

          <div className="space-y-3">
            {matches.length === 0 ? (
               <div className="py-16 text-center bg-card/30 rounded-3xl border border-dashed border-border/40">
                  <p className="text-sm text-muted-foreground">이 선수의 매치 기록이 아직 없습니다.</p>
               </div>
            ) : (
              matches.map((match: PlayerMatch) => {
                const isWinner = match.winner_id === id;
                const opponent = match.player1_id === id ? match.player2 : match.player1;
                
                return (
                  <div key={match.id} className="group bg-card border border-border/40 rounded-2xl p-4 flex items-center justify-between hover:border-nzu-green/30 transition-all">
                    <div className="flex items-center gap-5">
                       <div className={`w-12 h-6 flex items-center justify-center rounded-md text-[10px] font-black tracking-tighter ${isWinner ? 'bg-nzu-green/10 text-nzu-green' : 'bg-red-500/10 text-red-500'}`}>
                          {isWinner ? 'VICTORY' : 'DEFEAT'}
                       </div>
                       <div className="flex items-center gap-3">
                          <div className="relative w-8 h-8 rounded-full border border-border/60 overflow-hidden bg-muted/20">
                             <Image src={opponent?.photo_url || "/placeholder-player.png"} alt={opponent?.name || "Player"} fill className="object-cover" />
                          </div>
                          <div>
                             <span className="text-xs text-muted-foreground">vs</span>
                             <span className="ml-2 font-bold text-sm">{opponent?.name || "Unknown"}</span>
                          </div>
                       </div>
                    </div>
                    
                    <div className="flex items-center gap-8 text-right">
                       <div className="hidden sm:block">
                          <span className="block text-[8px] text-muted-foreground uppercase opacity-60">Map</span>
                          <span className="text-[10px] font-bold">{match.map_name || '-'}</span>
                       </div>
                       <div>
                          <span className="block text-[8px] text-muted-foreground uppercase opacity-60">Date</span>
                          <span className="text-[10px] font-medium opacity-80">{match.match_date ? new Date(match.match_date).toLocaleDateString() : '-'}</span>
                       </div>
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </section>
      </main>
    </div>
  );
}
