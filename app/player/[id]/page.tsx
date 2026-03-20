
import Navbar from "@/components/Navbar";
import { playerService } from "@/lib/player-service";
import { NZU_CONFIG } from "@/lib/constants";
import Image from "next/image";
import Link from "next/link";
import { LiveBadge, RaceTag, type Race, TierBadge } from "@/components/ui/nzu-badges";
import { cn } from "@/lib/utils";

export const revalidate = 60;
type PlayerMatch = Awaited<ReturnType<typeof playerService.getPlayerMatches>>[number];

export async function generateMetadata({ params }: { params: { id: string } }) {
  const { id } = await params;
  const player = await playerService.getPlayerById(id);
  
  return {
    title: player ? `${player.name} - NZU 공식 프로필` : "선수 정보를 찾을 수 없습니다",
    description: player?.nickname || `NZU 멤버 ${player?.name} 선수의 상세 전적 및 공식 기록입니다.`,
  };
}

export default async function PlayerProfilePage({ params }: { params: { id: string } }) {
  const { id } = await params;
  const player = await playerService.getPlayerById(id);
  const matches = await playerService.getPlayerMatches(id);

  if (!player) {
    return (
      <div className="min-h-screen bg-[#050706] flex flex-col">
        <Navbar />
        <div className="flex-1 flex flex-col items-center justify-center p-4">
          <div className="w-20 h-20 rounded-full bg-white/5 flex items-center justify-center text-4xl mb-6">🚫</div>
          <h1 className="text-2xl font-black text-white mb-6 uppercase tracking-tighter">선수를 찾을 수 없습니다</h1>
          <Link href="/tier" className="px-10 py-4 bg-nzu-green text-black rounded-xl font-black text-xs uppercase tracking-widest hover:bg-white transition-all shadow-xl">전체 명단으로 돌아가기</Link>
        </div>
      </div>
    );
  }

  // 티어별 테마 색상 결정
  const isElite = ['god', 'king'].includes(player.tier?.toLowerCase() || "");
  const themeColor = isElite ? "rgba(255, 215, 0, 0.4)" : "rgba(46, 213, 115, 0.4)";

  return (
    <div className="min-h-screen bg-[#050706] flex flex-col pb-32">
      <Navbar />

      <main className="flex-1 max-w-[1200px] mx-auto w-full px-8 pt-20">
        
        {/* Navigation Breadcrumb */}
        <Link href="/players" className="inline-flex items-center gap-3 text-white/30 hover:text-nzu-green text-xs font-black uppercase tracking-wider mb-12 transition-all group">
           <span className="group-hover:-translate-x-2 transition-transform duration-300">←</span> 전체 로스터 명단
        </Link>

        {/* === Tactical Player Hero Section === */}
        <section className="relative bg-[#0A0F0D] border border-white/5 rounded-[3rem] p-10 md:p-16 overflow-hidden mb-20 shadow-[0_30px_60px_rgba(0,0,0,0.5)]">
          {/* Background FX */}
          <div 
            className="absolute -top-20 -right-20 w-[600px] h-[600px] rounded-full blur-[160px] pointer-events-none opacity-20"
            style={{ backgroundColor: themeColor }}
          />
          <div className="absolute inset-0 bg-[url('https://www.transparenttextures.com/patterns/carbon-fibre.png')] opacity-[0.02] mix-blend-overlay pointer-events-none" />
          
          <div className="relative flex flex-col lg:flex-row items-center lg:items-end gap-12 lg:gap-20">
            {/* Player Portrait */}
            <div className="relative">
              <div className="relative w-56 h-56 md:w-72 md:h-72 rounded-[3rem] border-2 border-white/5 overflow-hidden shadow-2xl group">
                <Image 
                  src={player.photo_url || "/placeholder-player.png"} 
                  alt={player.name} 
                  fill 
                  priority
                  className="object-cover object-top transition-transform duration-700 group-hover:scale-110"
                />
                <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-transparent to-transparent opacity-60" />
              </div>
              
              {/* Status Badge Overlays */}
              <div className="absolute -top-4 -right-4 flex flex-col gap-2">
                 <TierBadge tier={player.tier} size="lg" />
                 {player.is_live && <LiveBadge />}
              </div>
            </div>

            {/* Profile Info */}
            <div className="flex-1 text-center lg:text-left">
               <div className="flex flex-col lg:flex-row items-center lg:items-center gap-6 mb-4">
                  <h1 className="text-6xl md:text-8xl font-black tracking-[-0.05em] uppercase text-white leading-none drop-shadow-2xl">
                    {player.name}
                  </h1>
                  <div className="px-5 py-2 bg-white/5 border border-white/10 rounded-full">
                     <RaceTag race={player.race as Race} />
                  </div>
               </div>
               
               <p className="text-nzu-green/60 text-xl md:text-2xl font-black tracking-tight mb-12 uppercase">
                  {player.nickname || "NZU 아카데미 정단원"}
               </p>

               {/* Tactical Gauge Stats */}
                <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                  <div className="p-5 md:p-6 bg-white/[0.02] border border-white/5 rounded-[2rem] flex flex-col justify-between hover:bg-white/[0.04] transition-colors group/card min-w-0">
                     <span className="block text-sm text-white/40 font-black uppercase tracking-widest mb-3 group-hover/card:text-nzu-green transition-colors truncate">현재 티어</span>
                     <span className="text-3xl md:text-4xl font-black text-nzu-green uppercase leading-none whitespace-nowrap">{player.tier}</span>
                  </div>
                  <div className="p-5 md:p-6 bg-white/[0.02] border border-white/5 rounded-[2rem] flex flex-col justify-between hover:bg-white/[0.04] transition-colors group/card min-w-0">
                     <span className="block text-sm text-white/40 font-black uppercase tracking-widest mb-3 group-hover/card:text-white/60 transition-colors truncate">ELO 점수</span>
                     <span className="text-3xl md:text-4xl font-black text-white tabular-nums leading-none whitespace-nowrap">
                       {player.elo_point?.toLocaleString() ?? '1,000'} <span className="text-sm opacity-30 ml-1">점</span>
                     </span>
                  </div>
                  <div className="p-5 md:p-6 bg-white/[0.02] border border-white/5 rounded-[2rem] flex flex-col justify-between hover:bg-white/[0.04] transition-colors group/card min-w-0">
                     <span className="block text-sm text-white/40 font-black uppercase tracking-widest mb-3 group-hover/card:text-white/60 transition-colors truncate">통산 승률</span>
                     <span className="text-3xl md:text-4xl font-black text-white tabular-nums leading-none whitespace-nowrap">{player.win_rate ? `${player.win_rate}%` : '50%'}</span>
                  </div>
                  <div className="p-5 md:p-6 bg-white/[0.03] border border-nzu-green/20 rounded-[2rem] flex flex-col justify-between shadow-[0_0_40px_rgba(46,213,115,0.08)] bg-gradient-to-br from-nzu-green/[0.02] to-transparent hover:from-nzu-green/[0.05] transition-all min-w-0">
                     <span className="block text-sm text-white/50 font-black uppercase tracking-widest mb-3 truncate">소속 대학</span>
                     <span className="text-xl md:text-2xl lg:text-3xl font-black text-nzu-green uppercase tracking-tighter leading-none whitespace-nowrap break-keep">
                        {player.university || "NZU"}
                     </span>
                  </div>
               </div>
            </div>
          </div>
        </section>

        {/* === Match Analysis History === */}
        <section>
          <div className="flex flex-col md:flex-row md:items-end justify-between mb-12 px-2 gap-4">
             <div className="flex items-center gap-5">
                <div className="w-3 h-3 rounded-full bg-nzu-green shadow-[0_0_15px_rgba(46,213,115,0.5)] animate-pulse" />
                <h2 className="text-2xl md:text-3xl font-black text-white uppercase tracking-[0.2em] leading-none">공식 교전 기록</h2>
             </div>
             <span className="text-sm md:text-base font-bold text-white/30 uppercase tracking-[0.1em] pb-1 border-b border-white/5">최근 20경기 기준</span>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {matches.length === 0 ? (
               <div className="md:col-span-2 py-32 text-center bg-white/[0.01] rounded-[3rem] border border-dashed border-white/10">
                  <div className="text-4xl mb-6 opacity-20">📊</div>
                  <p className="text-sm text-white/30 font-black uppercase tracking-widest">기록된 교전 데이터가 없습니다.<br/>공식 경기를 기다리는 중입니다.</p>
               </div>
            ) : (
              matches.map((match: PlayerMatch, index: number) => {
                const isWinner = match.winner_id === id;
                const opponent = match.player1_id === id ? match.player2 : match.player1;
                
                return (
                  <div 
                    key={match.id} 
                    className="group relative bg-[#0A0F0D] border border-white/5 rounded-[2.5rem] p-8 flex items-center justify-between hover:border-nzu-green/30 hover:bg-white/[0.03] transition-all duration-500 shadow-xl overflow-hidden fade-in"
                    style={{ animationDelay: `${index * 0.05}s`, animationFillMode: 'both' }}
                  >
                    <div className="absolute top-0 left-0 w-1.5 h-full transition-all duration-500 bg-white/5 group-hover:bg-nzu-green" />
                    
                    <div className="flex items-center gap-8 pl-4">
                        <div className={cn(
                          "w-16 h-8 flex items-center justify-center rounded-xl text-[10px] font-black tracking-widest transition-all",
                          isWinner ? "bg-nzu-green/10 text-nzu-green shadow-[0_0_20px_rgba(46,213,115,0.1)]" : "bg-red-500/10 text-red-500"
                        )}>
                           {isWinner ? '승리' : '패배'}
                        </div>
                       
                       <div className="flex items-center gap-6">
                          <div className="relative w-14 h-14 rounded-2xl border border-white/10 overflow-hidden bg-white/5 shadow-lg group-hover:scale-110 transition-transform">
                             <Image src={opponent?.photo_url || "/placeholder-player.png"} alt={opponent?.name || "Player"} fill className="object-cover" />
                          </div>
                           <div>
                              <span className="text-[9px] text-white/20 uppercase font-black tracking-widest block mb-1">상대 선수</span>
                              <span className="font-black text-white text-lg tracking-tighter uppercase">{opponent?.name || "알 수 없음"}</span>
                           </div>
                       </div>
                    </div>
                    
                     <div className="flex flex-col items-end gap-2 text-right">
                        <div className="px-3 py-1 bg-white/5 rounded-md border border-white/5">
                           <span className="text-[10px] font-black text-white/40 uppercase tracking-widest">{match.map_name || '아레나'}</span>
                        </div>
                       <span className="text-[10px] font-medium text-white/20 tabular-nums">
                          {match.match_date ? new Date(match.match_date).toLocaleDateString() : '-'}
                       </span>
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
