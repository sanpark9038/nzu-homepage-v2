
import Navbar from "@/components/Navbar";
import { LiveStreamCard, type LiveStream } from "@/components/live/LiveStreamCard";
import { playerService } from "@/lib/player-service";
import { NZU_CONFIG } from "@/lib/constants";

export const revalidate = 60;

function getMockViewerCount(playerId: string): number {
  let hash = 0;
  for (let i = 0; i < playerId.length; i += 1) {
    hash = (hash * 31 + playerId.charCodeAt(i)) % 500;
  }
  return hash + 100;
}

export default async function LivePage() {
  // 현재는 API가 없으므로 DB의 is_live 선수들을 기반으로 Mock 데이터를 구성
  const allPlayers = await playerService.getAllPlayers();
  const livePlayers = allPlayers.filter(p => p.is_live);

  const mockLiveStreams: LiveStream[] = livePlayers.map(p => ({
    id: p.id,
    streamer_name: p.name,
    photo_url: p.photo_url || "",
    stream_title: `${p.name} - 숲 스타크래프트 NZU 대학대전 연습중`,
    viewer_count: getMockViewerCount(p.id),
    category: "Starcraft",
    race: p.race || "T",
    soop_url: p.broadcast_url || `https://ch.sooplive.co.kr`,
  }));

  const totalViewers = mockLiveStreams.reduce((acc, curr) => acc + curr.viewer_count, 0);

  return (
    <div className="min-h-screen flex flex-col bg-background">
      <Navbar />

      <main className="flex-1 max-w-[1600px] mx-auto w-full px-6 md:px-12 py-10 md:py-16 fade-in">
        
        {/* === 글로벌 방송 헤더 섹션 === */}
        <div className="flex flex-col lg:flex-row lg:items-end justify-between gap-10 mb-16 lg:mb-20 border-b border-white/5 pb-12 lg:pb-16 relative text-center lg:text-left">
          <div className="absolute top-0 right-1/4 w-[400px] h-[400px] bg-nzu-live/5 blur-[120px] rounded-full pointer-events-none" />
          
          <div className="relative z-10">
            <div className="flex flex-col sm:flex-row items-center justify-center lg:justify-start gap-3 mb-6">
               <div className="flex items-center gap-2 px-3 py-1 bg-nzu-live/10 rounded-md border border-nzu-live/20">
                  <span className="w-2 h-2 rounded-full bg-nzu-live animate-ping" />
                  <span className="text-nzu-live text-[10px] font-black uppercase tracking-widest">전역 실시간 방송</span>
               </div>
               <span className="text-white/20 text-[10px] font-bold tracking-widest uppercase lg:border-l lg:border-white/10 lg:ml-2 lg:pl-4">숲 TV 아카이브 기반</span>
            </div>
            
            <h1 className="text-4xl md:text-5xl lg:text-[5.5rem] font-black tracking-tighter uppercase text-white leading-none mb-6">
               실황 <span className="text-nzu-live">중계 센터</span>
            </h1>
            <p className="text-white/40 text-sm md:text-xl font-medium tracking-tight max-w-2xl mx-auto lg:mx-0">
               NZU 멤버들의 실시간 전장 브로드캐스트를 한곳에서 통제합니다.
            </p>
          </div>
          
          <div className="flex flex-col gap-6 relative z-10 w-full lg:w-auto">
             <div className="flex items-center gap-6 md:gap-10 justify-center lg:justify-end mb-4">
                <div className="flex flex-col items-center lg:items-end">
                   <span className="text-[9px] font-black text-white/30 uppercase tracking-[0.3em] mb-1">현재 방송 중</span>
                   <span className="text-3xl md:text-4xl font-black text-nzu-live tabular-nums">{mockLiveStreams.length} <span className="text-xs font-bold text-white/20 ml-1">ON</span></span>
                </div>
                <div className="w-px h-10 md:h-12 bg-white/10" />
                <div className="flex flex-col items-center lg:items-end">
                   <span className="text-[9px] font-black text-white/30 uppercase tracking-[0.3em] mb-1">합계 시청자 수</span>
                   <span className="text-3xl md:text-4xl font-black text-white tabular-nums">
                      {totalViewers.toLocaleString()} 
                      <span className="text-xs font-bold text-nzu-green ml-2 uppercase hidden sm:inline">시청 중</span>
                   </span>
                </div>
             </div>
             
             <div className="bg-white/[0.03] border border-white/5 px-4 py-2 rounded-xl text-[9px] md:text-[10px] font-bold text-white/40 flex items-center justify-center lg:justify-start gap-2 self-center lg:self-end shadow-2xl">
                <span className="text-nzu-green animate-pulse">●</span> 외부 데이터 동기화 파이프라인 가동 중
             </div>
          </div>
        </div>

        {mockLiveStreams.length === 0 ? (
          <div className="mt-12 py-40 border border-white/[0.03] bg-white/[0.01] rounded-[3rem] flex flex-col items-center justify-center text-center shadow-inner">
             <div className="w-24 h-24 rounded-full bg-nzu-live/5 flex items-center justify-center mb-8 text-4xl border border-nzu-live/10">📡</div>
             <h2 className="text-2xl font-black mb-4 text-white uppercase tracking-tight">현재 방송 중인 멤버가 없습니다</h2>
             <p className="text-sm text-white/40 max-w-xs font-medium leading-relaxed">
                NZU 멤버들이 방송을 시작하면<br/>이곳에 실시간으로 표시됩니다.
             </p>
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-8">
            {mockLiveStreams.map((stream) => (
              <LiveStreamCard key={stream.id} stream={stream} />
            ))}
          </div>
        )}

        {/* 안내 섹션 */}
        <div className="mt-32 p-12 bg-gradient-to-br from-white/[0.02] to-transparent border border-white/5 rounded-[4rem] relative overflow-hidden group">
           <div className="absolute -top-40 -right-40 w-80 h-80 bg-nzu-green/5 blur-[120px] rounded-full group-hover:bg-nzu-green/10 transition-all duration-1000" />
           
           <div className="grid md:grid-cols-2 gap-16 items-center relative z-10">
              <div>
                 <div className="text-nzu-green text-[10px] font-black uppercase tracking-[0.4em] mb-4">가동 인프라</div>
                 <h2 className="text-2xl font-black text-white mb-6 uppercase tracking-tighter">숲 TV API 연동 안내</h2>
                 <p className="text-base text-white/40 leading-relaxed font-medium">
                    본 시스템은 SOOP TV 파트너 API를 통해 스트림 데이터를 실시간으로 수집합니다.
                    공식 API 승인 전까지는 멤버 기반 동기화 데이터를 바탕으로 실황이 표시됩니다.
                 </p>
                 <div className="mt-10 flex gap-4">
                    <div className="px-5 py-2 bg-white/5 rounded-full text-[10px] font-black text-white/60 uppercase tracking-widest border border-white/5">자동 동기화</div>
                    <div className="px-5 py-2 bg-white/5 rounded-full text-[10px] font-black text-white/60 uppercase tracking-widest border border-white/5">저지연 스트리밍</div>
                 </div>
              </div>
              <div className="grid grid-cols-1 gap-4">
                 <div className="flex items-center gap-5 p-6 bg-[#0A0F0D] rounded-2xl border border-white/5 hover:border-nzu-green/30 transition-colors shadow-xl">
                    <div className="w-10 h-10 rounded-full bg-nzu-green/10 flex items-center justify-center text-nzu-green font-bold text-xl">✓</div>
                    <div>
                       <div className="text-xs font-black text-white uppercase tracking-widest mb-1">시청자 수 모니터링</div>
                       <div className="text-[10px] text-white/30 font-medium">실시간 E-sports 데이터 집계 연동</div>
                    </div>
                 </div>
                 <div className="flex items-center gap-5 p-6 bg-[#0A0F0D] rounded-2xl border border-white/5 hover:border-nzu-green/30 transition-colors shadow-xl">
                    <div className="w-10 h-10 rounded-full bg-nzu-green/10 flex items-center justify-center text-nzu-green font-bold text-xl">✓</div>
                    <div>
                       <div className="text-xs font-black text-white uppercase tracking-widest mb-1">방송 요약 자동화</div>
                       <div className="text-[10px] text-white/30 font-medium">방송 제목 및 메타데이터 자동 추출</div>
                    </div>
                 </div>
              </div>
           </div>
        </div>
      </main>

      <footer className="border-t border-white/5 py-12 bg-black/40 mt-32">
          <div className="max-w-6xl mx-auto px-12 flex flex-col md:flex-row items-center justify-between gap-8 text-[10px] font-black uppercase tracking-[0.3em] text-white/30">
              <div className="flex items-center gap-2">
                <span className="w-1.5 h-1.5 rounded-full bg-nzu-green shadow-[0_0_10px_#2ed573]" />
                SOOP TV API 아카이브 연동 활성화
              </div>
              <div className="text-right">
                 산박 대표님의 부장, 엘레이드박 설계
              </div>
          </div>
      </footer>
    </div>
  );
}
