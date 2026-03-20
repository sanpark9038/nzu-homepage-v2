
import Navbar from "@/components/Navbar";
import { TierGroup } from "@/components/players/TierGroup";
import { PlayerRow } from "@/components/players/PlayerRow";
import { playerService } from "@/lib/player-service";
import { NZU_CONFIG } from "@/lib/constants";
import { PlayerSearch, RaceFilter } from "@/components/players/Filters";
import Link from "next/link";

export const revalidate = 60;

export default async function TierPage({
  searchParams,
}: {
  searchParams: { search?: string; race?: string };
}) {
  const { search, race } = await searchParams;
  let playerList = await playerService.getAllPlayers();

  // 필터링 적용
  if (search) {
    playerList = playerList.filter(p => p.name.includes(search));
  }
  if (race && race !== 'ALL') {
    playerList = playerList.filter(p => p.race === race);
  }

  // 티어별 그룹화 로직
  const godPlayers = playerList.filter(p => p.tier === 'god');
  const kingPlayers = playerList.filter(p => p.tier === 'king');
  const jackPlayers = playerList.filter(p => p.tier === 'jack');
  const jokerPlayers = playerList.filter(p => p.tier === 'joker');
  const numberedPlayers = playerList.filter(p => !isNaN(Number(p.tier))).sort((a, b) => Number(a.tier) - Number(b.tier));

  const hasResults = playerList.length > 0;

  return (
    <div className="min-h-screen flex flex-col bg-[#020403]">
      <Navbar />

      <main className="flex-1 max-w-[1600px] mx-auto w-full px-12 py-16 fade-in">
        {/* === 프리미엄 헤더 섹션 === */}
        <div className="flex flex-col md:flex-row md:items-end justify-between gap-10 mb-20 border-b border-white/5 pb-16 relative">
          <div className="absolute -left-20 top-0 w-40 h-40 bg-nzu-green/10 blur-[100px] rounded-full pointer-events-none" />
          
          <div className="relative z-10">
            <div className="flex items-center gap-3 mb-4">
               <span className="px-3 py-1 bg-nzu-green/10 text-nzu-green text-[10px] font-black uppercase tracking-widest rounded-md border border-nzu-green/20">
                 실시간 아카이브
               </span>
               <span className="text-white/20 text-[10px] font-bold tracking-widest uppercase">2025년 1분기 시즌</span>
            </div>
            <h1 className="text-5xl md:text-7xl font-black tracking-tighter uppercase text-white leading-none mb-6">
              실시간 <span className="text-nzu-green">티어 랭킹</span>
            </h1>
            <p className="text-white/40 text-lg font-medium tracking-tight">
              NZU 통합 멤버들의 실시간 전적 및 ELO 기반 공식 티어표입니다.
            </p>
          </div>
          
          <div className="flex flex-col gap-6 relative z-10">
             <div className="flex items-center gap-6 text-right justify-end mb-2">
                <div className="flex flex-col">
                   <span className="text-[10px] font-black text-white/30 uppercase tracking-widest">전체 선수 수</span>
                   <span className="text-2xl font-black text-white">{playerList.length} <span className="text-xs font-bold text-white/40">명</span></span>
                </div>
                <div className="w-px h-8 bg-white/10" />
                <div className="flex flex-col text-nzu-green">
                   <span className="text-[10px] font-black opacity-60 uppercase tracking-widest">실시간 방송 중</span>
                   <span className="text-2xl font-black">{playerList.filter(p => p.is_live).length} <span className="text-xs font-bold opacity-60">ON</span></span>
                </div>
             </div>
             
             <div className="flex flex-col sm:flex-row items-center gap-4 bg-white/[0.03] p-2 rounded-2xl border border-white/5 shadow-2xl backdrop-blur-sm">
                <PlayerSearch />
                <RaceFilter />
             </div>
          </div>
        </div>

        {!hasResults ? (
          <div className="py-32 text-center bg-white/[0.02] rounded-3xl border border-dashed border-white/10">
             <div className="text-4xl mb-6 opacity-30">🕵️‍♂️</div>
             <h2 className="text-xl font-bold mb-2 text-white">찾으시는 선수가 없습니다</h2>
             <p className="text-sm text-white/40 mb-8">검색어 혹은 필터를 변경해 보시겠습니까?</p>
             <Link href="/tier" className="px-10 py-4 bg-nzu-green text-black rounded-xl text-xs font-black uppercase tracking-widest shadow-lg shadow-nzu-green/20 transition-colors">초기화하기</Link>
          </div>
        ) : (
          <div className="space-y-12">
            {godPlayers.length > 0 && <TierGroup rankName="신계 (GODS)" players={godPlayers} startIndex={0} />}
            {kingPlayers.length > 0 && <TierGroup rankName="제왕 (KINGS)" players={kingPlayers} startIndex={godPlayers.length} />}
            {(jackPlayers.length > 0 || jokerPlayers.length > 0) && (
              <TierGroup rankName="상위권" players={[...jackPlayers, ...jokerPlayers]} startIndex={godPlayers.length + kingPlayers.length} />
            )}
            
            {numberedPlayers.length > 0 && (
              <div className="mb-4">
                  <div className="flex items-center gap-3 mb-3 px-1">
                    <span className="text-sm font-black text-white/20 uppercase tracking-widest">일반 활동 인원</span>
                    <div className="flex-1 h-px bg-white/5" />
                  </div>
                  <div className="bg-white/[0.02] rounded-2xl border border-white/5 overflow-hidden shadow-2xl">
                    <div className="grid grid-cols-[3rem_2fr_1fr_1fr_1fr] px-4 py-4 border-b border-white/5 bg-white/[0.01] text-[9px] font-black text-white/20 uppercase tracking-widest">
                      <span className="text-center">순위</span>
                      <span>선수 정보</span>
                      <span className="text-center">승률</span>
                      <span className="text-center">ELO 점수</span>
                      <span className="text-right">최근 전적</span>
                    </div>
                    <div className="divide-y divide-white/5">
                      {numberedPlayers.map((player, index) => (
                        <PlayerRow key={player.id} player={player} rank={godPlayers.length + kingPlayers.length + jackPlayers.length + jokerPlayers.length + index + 1} />
                      ))}
                    </div>
                  </div>
              </div>
            )}
          </div>
        )}
      </main>

      <footer className="border-t border-white/5 py-16 bg-black/40 backdrop-blur-md mt-24">
          <div className="max-w-[1400px] mx-auto px-8 flex flex-col md:flex-row items-center justify-between gap-12">
              <div className="flex items-center gap-3 text-xs text-white/40 font-bold tracking-tighter uppercase">
                <span className="w-2 h-2 rounded-full bg-nzu-green shadow-[0_0_10px_#2ed573] animate-pulse" />
                실시간 동기화 활성화
              </div>
              <div className="text-[10px] text-white/20 text-center md:text-right font-black uppercase tracking-widest">
                © 2025 NZU · 늪지대 유니버시티 아카이브 시스템<br/>
                <span className="text-nzu-green/40">산박 대표님의 부장, 엘레이드박 설계</span>
              </div>
          </div>
      </footer>
    </div>
  );
}
