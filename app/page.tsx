
import Navbar from "@/components/Navbar";
import { playerService } from "@/lib/player-service";
import { NZU_CONFIG } from "@/lib/constants";
import Link from "next/link";
import { StatCounter } from "@/components/home/StatCounter";
import { PlayerCard } from "@/components/players/PlayerCard";
import { LiveStreamCard } from "@/components/live/LiveStreamCard";
import { cn } from "@/lib/utils";

export const revalidate = 60;

export default async function HomePage() {
  const allPlayers = await playerService.getAllPlayers();
  const recentMatches = await playerService.getRecentMatches(15);
  const livePlayers = allPlayers.filter(p => p.is_live);
  const topRankers = [...allPlayers]
    .sort((a, b) => (b.elo_point || 0) - (a.elo_point || 0))
    .slice(0, 4);

  return (
    <div className="min-h-screen flex flex-col bg-[#050706]">
      <Navbar />

      <main className="flex-1 dashboard-grid lg:h-[calc(100vh-64px)] lg:overflow-hidden p-0 gap-0">
        
        {/* === 왼쪽 사이드바: 최근 전적 피드 === */}
        <aside className="bg-[#050605] border-b lg:border-r border-white/5 overflow-y-auto custom-scrollbar relative order-2 lg:order-1 h-[600px] lg:h-full">
          <div className="absolute top-0 left-0 w-1 h-full bg-nzu-green/20" />
          
          <div className="sticky top-0 z-20 bg-[#050605]/95 backdrop-blur-md p-6 border-b border-white/5">
            <div className="flex items-center justify-between mb-1">
              <h2 className="text-[10px] font-black text-white/40 uppercase tracking-[0.3em]">최근 전적 분석</h2>
              <div className="flex items-center gap-2">
                <span className="w-1.5 h-1.5 rounded-full bg-nzu-green animate-pulse" />
                <span className="text-[9px] font-bold text-nzu-green uppercase tracking-widest">실시간 동기화</span>
              </div>
            </div>
            <h3 className="text-xl font-black text-white tracking-tighter">최근 <span className="text-nzu-green">전적 로그</span></h3>
          </div>

          <div className="p-4 space-y-3">
            {recentMatches.length === 0 ? (
              <div className="py-24 flex flex-col items-center justify-center space-y-4 opacity-30 group/empty">
                <div className="relative w-12 h-12 flex items-center justify-center">
                  <div className="absolute inset-0 border-2 border-nzu-green/30 rounded-full animate-ping" />
                  <div className="w-8 h-8 border-2 border-nzu-green/50 rounded-lg rotate-45 animate-pulse" />
                  <div className="absolute text-[8px] font-black text-nzu-green tracking-tighter">NZU</div>
                </div>
                <div className="flex flex-col items-center">
                  <p className="text-[10px] font-black uppercase tracking-[0.5em] text-white">시그널 대기 중</p>
                  <div className="flex gap-1 mt-2">
                    {[1, 2, 3].map(i => (
                      <div key={i} className="w-1 h-1 bg-nzu-green rounded-full animate-bounce" style={{ animationDelay: `${i * 0.2}s` }} />
                    ))}
                  </div>
                </div>
              </div>
            ) : (
              recentMatches.map((match) => (
                <div key={match.id} className="group relative bg-white/[0.02] border border-white/5 rounded-2xl p-4 hover:bg-white/[0.04] transition-all duration-300">
                  <div className="absolute top-0 left-0 w-1 h-full bg-white/5 group-hover:bg-nzu-green transition-colors" />
                  <div className="flex items-center justify-between mb-3 text-[9px] font-bold text-white/20 uppercase tracking-widest">
                    <span>{match.map_name || '경기장 정보 없음'}</span>
                    <span className="tabular-nums">{match.match_date ? new Date(match.match_date).toLocaleDateString() : '-'}</span>
                  </div>
                  
                  <div className="flex items-center justify-between gap-2">
                     {/* 선수 1 */}
                     <div className="flex flex-col items-center flex-1">
                        <span className={cn(
                          "text-[12px] font-black uppercase tracking-tighter transition-colors text-center",
                          match.winner_id === match.player1_id ? "text-nzu-green drop-shadow-[0_0_8px_rgba(46,213,115,0.4)]" : "text-white/40"
                        )}>
                          {(match as any).player1?.name || '정보 없음'}
                        </span>
                     </div>

                     <div className="flex flex-col items-center px-1">
                        <span className="text-[9px] font-black text-white/10">VS</span>
                     </div>

                     {/* 선수 2 */}
                     <div className="flex flex-col items-center flex-1">
                        <span className={cn(
                          "text-[12px] font-black uppercase tracking-tighter transition-colors text-center",
                          match.winner_id === match.player2_id ? "text-nzu-green drop-shadow-[0_0_8px_rgba(46,213,115,0.4)]" : "text-white/40"
                        )}>
                          {(match as any).player2?.name || '정보 없음'}
                        </span>
                     </div>
                  </div>
                </div>
              ))
            )}
          </div>
        </aside>

        {/* === 오른쪽 메인 콘텐츠 === */}
        <section className="overflow-y-auto lg:h-full custom-scrollbar order-1 lg:order-2 bg-[#050706]">
          {/* 히어로 섹션 (미니멀 + 고밀도 개편) */}
          <div className="relative overflow-hidden pt-16 pb-20 lg:pt-24 lg:pb-32 border-b border-white/5 flex items-center px-8 md:px-20 min-h-[50vh]">
            <div className="absolute inset-0 pointer-events-none">
              <div className="absolute top-0 right-1/4 w-[800px] h-[600px] bg-nzu-green/[0.05] rounded-full blur-[160px] opacity-50 animate-pulse-slow" />
              <div className="absolute bottom-0 left-1/4 w-[400px] h-[400px] bg-nzu-gold/[0.03] rounded-full blur-[140px] opacity-30" />
              <div className="absolute inset-0 bg-[linear-gradient(to_right,#ffffff03_1px,transparent_1px),linear-gradient(to_bottom,#ffffff03_1px,transparent_1px)] bg-[size:64px_64px] [mask-image:radial-gradient(ellipse_60%_50%_at_50%_50%,#000_70%,transparent_100%)]" />
              
              {/* === Tactical Scan Line (컴팩트 스캐너) === */}
              <div className="absolute inset-x-0 h-px bg-gradient-to-r from-transparent via-nzu-green/30 to-transparent top-0 animate-scan-y opacity-40" />
            </div>

            <div className="relative z-10 w-full max-w-6xl mx-auto">
              <div className="flex flex-col items-center lg:items-start text-center lg:text-left gap-6">
                <div className="space-y-4 relative group">
                  {/* === Tactical Metadata (밀착 배치) === */}
                  <div className="absolute -top-10 left-0 hidden lg:flex flex-col gap-0.5 opacity-20 group-hover:opacity-40 transition-opacity">
                    <span className="text-[7px] font-black text-white uppercase tracking-widest">Active_V2</span>
                    <span className="text-[7px] font-black text-nzu-green uppercase tracking-[0.1em]">37.5 / 126.9</span>
                  </div>

                  <div className="flex items-center justify-center lg:justify-start gap-3">
                    <span className="px-2.5 py-1 bg-nzu-green/10 text-nzu-green text-[9px] font-black uppercase tracking-[0.4em] rounded border-l-2 border-nzu-green shadow-[0_0_10px_rgba(0,168,107,0.1)]">NZU Archive</span>
                  </div>
                  <h1 className="text-5xl md:text-[6.5rem] font-black tracking-[-0.04em] uppercase text-white leading-[0.85] drop-shadow-xl font-heading relative pr-4">
                    N<span className="text-nzu-green glow-green-text">.</span>Z<span className="text-nzu-green glow-green-text">.</span>U
                    <div className="absolute -right-2 -top-2 w-8 h-8 border-t border-r border-white/10" />
                    <div className="absolute -left-2 -bottom-2 w-8 h-8 border-b border-l border-white/10" />
                  </h1>
                  <h2 className="text-lg md:text-2xl font-black text-white/50 uppercase tracking-tighter">
                    스타크래프트 <span className="text-white">전술 데이터 센터</span>
                  </h2>
                </div>

                <div className="flex flex-wrap items-center justify-center lg:justify-start gap-3 pt-6">
                  <Link href="/entry" className="group relative px-8 py-4 bg-nzu-green text-black font-black uppercase text-[10px] tracking-widest rounded-lg overflow-hidden transition-all hover:-translate-y-0.5 hover:shadow-[0_15px_30px_rgba(0,168,107,0.3)] active:scale-95">
                    <span className="relative z-10">엔트리 분석 시작</span>
                    <div className="absolute inset-0 bg-white translate-x-[-100%] group-hover:translate-x-0 transition-transform duration-500 opacity-20" />
                  </Link>
                  <Link href="/players" className="px-10 py-5 bg-[#0F1A12] text-white font-black uppercase text-xs tracking-widest rounded-lg border border-nzu-green/20 hover:bg-[#1A2B1D] hover:border-nzu-green/50 transition-all shadow-[0_0_15px_rgba(0,0,0,0.5)]">
                    선수 명단 보기
                  </Link>
                </div>
              </div>
            </div>
          </div>

          <div className="px-8 md:px-20 py-24 max-w-[1400px] mx-auto space-y-32">
            {/* 통계 요약 */}
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-8">
               <StatCounter label="활동 선수" value={allPlayers.length} suffix="+ " color="nzu-green" />
               <StatCounter label="총 경기 수" value={recentMatches.length + 1240} suffix="" color="white" />
               <StatCounter label="평균 승률" value={54.2} suffix="%" color="nzu-gold" />
               <StatCounter label="라이브 방송" value={livePlayers.length} suffix=" ON" color="nzu-live" />
            </div>

            {/* 실시간 방송 섹션 */}
            {livePlayers.length > 0 && (
              <section>
                <div className="flex items-center gap-4 mb-12">
                   <h2 className="text-sm font-black text-white uppercase tracking-[0.4em]">실시간 방송</h2>
                   <div className="flex-1 h-px bg-white/5" />
                </div>
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-8">
                   {livePlayers.map(p => (
                      <PlayerCard key={p.id} player={p} layout="compact" />
                   ))}
                </div>
              </section>
            )}

            {/* 상위 랭커 섹션 */}
            <section className="pb-32">
                <div className="flex items-center gap-4 mb-12">
                   <div className="flex flex-col">
                     <h2 className="text-[10px] font-black text-nzu-gold uppercase tracking-[0.5em] mb-1">Top Class</h2>
                     <h3 className="text-2xl font-black text-white uppercase tracking-tighter">최우수 <span className="text-nzu-gold">선수</span></h3>
                   </div>
                   <div className="flex-1 h-px bg-gradient-to-r from-nzu-gold/30 to-transparent" />
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-8">
                   {topRankers.map((p, index) => (
                      <div key={p.id} className="relative group/ranker">
                        {/* === Rank Badge (럭셔리 랭크 뱃지) === */}
                        <div className={cn(
                          "absolute -top-4 -left-4 w-12 h-12 rounded-xl border-2 flex items-center justify-center z-20 font-black text-lg shadow-2xl transition-transform group-hover/ranker:scale-110 group-hover/ranker:-rotate-12",
                          index === 0 ? "bg-nzu-gold border-white/50 text-black" : 
                          index === 1 ? "bg-slate-300 border-white/50 text-black" :
                          index === 2 ? "bg-amber-700 border-white/50 text-white" :
                          "bg-black/80 border-white/10 text-white/50"
                        )}>
                          {index + 1}
                        </div>
                        
                        {/* === Card Glow === */}
                        <div className={cn(
                          "absolute inset-0 blur-[30px] opacity-0 group-hover/ranker:opacity-40 transition-opacity pointer-events-none",
                          index === 0 ? "bg-nzu-gold" : "bg-nzu-green"
                        )} />

                        <PlayerCard player={p} className="relative z-10 border-white/10 group-hover/ranker:border-nzu-gold/50 transition-colors" />
                      </div>
                   ))}
                </div>
            </section>
          </div>
        </section>
      </main>
    </div>
  );
}
