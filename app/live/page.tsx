
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
  // 추후 SOOP API 연동 시 이 부분을 교체 예정
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

  return (
    <div className="min-h-screen flex flex-col bg-[#0A0F0D]">
      <Navbar />

      <main className="flex-1 max-w-6xl mx-auto w-full px-4 py-8 fade-in">
        <div className="flex flex-col md:flex-row md:items-end justify-between gap-4 mb-8">
          <div>
            <div className="flex items-center gap-2 mb-2">
               <span className="w-2 h-2 rounded-full bg-nzu-live live-dot" />
               <span className="text-[10px] font-bold text-nzu-live uppercase tracking-widest">Live Connect</span>
            </div>
            <h1 className="text-4xl font-black tracking-tighter uppercase italic">
               Live <span className="gradient-text">Center</span>
            </h1>
            <p className="text-muted-foreground text-sm mt-1">SOOP TV 실시간 NZU 방송 목록</p>
          </div>

          <div className="text-xs text-muted-foreground bg-card border border-border/40 px-3 py-1.5 rounded-lg flex items-center gap-2">
             <span className="text-nzu-green font-bold">●</span> SOOP TV API 연동 대기 중
          </div>
        </div>

        {mockLiveStreams.length === 0 ? (
          <div className="mt-12 p-20 border border-dashed border-border/60 rounded-3xl flex flex-col items-center justify-center text-center">
             <div className="w-16 h-16 rounded-full bg-muted/10 flex items-center justify-center mb-6 text-2xl">📡</div>
             <h2 className="text-xl font-bold mb-2 text-foreground/80">현재 방송 중인 멤버가 없습니다</h2>
             <p className="text-sm text-muted-foreground max-w-xs">
                NZU 멤버들이 방송을 시작하면 이곳에 실시간으로 표시됩니다.
             </p>
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
            {mockLiveStreams.map((stream) => (
              <LiveStreamCard key={stream.id} stream={stream} />
            ))}
          </div>
        )}

        {/* 안내 섹션 */}
        <div className="mt-16 p-8 bg-gradient-to-br from-card to-background border border-border/40 rounded-3xl">
           <div className="grid md:grid-cols-2 gap-8 items-center">
              <div>
                 <h2 className="text-xl font-bold mb-3">SOOP TV API 연동 안내</h2>
                 <p className="text-sm text-muted-foreground leading-relaxed">
                    본 시스템은 SOOP TV(구 아프리카TV) 파트너 API를 통해 스트림 데이터를 실시간으로 수집할 예정입니다.
                    API 승인 전까지는 멤버 기반 동기화 데이터를 기반으로 임시 표시됩니다.
                 </p>
              </div>
              <div className="flex flex-col gap-3">
                 <div className="flex items-center gap-3 p-4 bg-background/50 rounded-xl border border-border/20">
                    <span className="text-nzu-green text-lg">✓</span>
                    <span className="text-xs font-bold">실시간 시청자 수 업데이트</span>
                 </div>
                 <div className="flex items-center gap-3 p-4 bg-background/50 rounded-xl border border-border/20">
                    <span className="text-nzu-green text-lg">✓</span>
                    <span className="text-xs font-bold">방송 제목 및 썸네일 수집</span>
                 </div>
              </div>
           </div>
        </div>
      </main>

      <footer className="border-t border-border/40 py-8 bg-black/20 mt-20">
          <div className="max-w-6xl mx-auto px-4 flex flex-col md:flex-row items-center justify-between gap-4 text-xs text-muted-foreground">
              <div className="flex items-center gap-2">
                <span className="w-1.5 h-1.5 rounded-full bg-nzu-green" />
                SOOP API FOUNDATION READY
              </div>
              <div className="text-right opacity-60">
                 Designed for CEO SANPARK by El-Rade Park
              </div>
          </div>
      </footer>
    </div>
  );
}
