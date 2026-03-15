
import Navbar from "@/components/Navbar";
import { playerService } from "@/lib/player-service";
import { MatchForm } from "./MatchForm";

export const metadata = {
  title: "NZU Admin - 전적 입력",
};

export default async function AdminMatchPage() {
  const players = await playerService.getAllPlayers();

  return (
    <div className="min-h-screen flex flex-col bg-background">
      <Navbar />

      <main className="flex-1 max-w-4xl mx-auto w-full px-4 py-12">
        <header className="mb-12">
          <div className="flex items-center gap-2 mb-2">
             <span className="px-2 py-0.5 bg-nzu-green/10 text-nzu-green border border-nzu-green/20 rounded text-[10px] font-black uppercase tracking-widest">
                Admin Control
             </span>
          </div>
          <h1 className="text-4xl font-black tracking-tighter uppercase italic">
             Match <span className="gradient-text">Entry</span>
          </h1>
          <p className="text-muted-foreground text-sm mt-1">NZU 대학대전 및 연습 경기 전적 공식 기록 도구</p>
        </header>

        <section className="bg-card border border-border/40 rounded-[2.5rem] p-8 md:p-12 shadow-2xl relative overflow-hidden">
           {/* 배경 장식 */}
           <div className="absolute top-0 right-0 w-64 h-64 bg-nzu-green/5 blur-[100px] rounded-full -translate-y-1/2 translate-x-1/2" />
           
           <div className="relative">
              <MatchForm players={players} />
           </div>
        </section>

        <footer className="mt-12 p-6 border border-border/20 rounded-2xl bg-muted/5">
           <h3 className="text-xs font-black uppercase tracking-widest mb-3 opacity-60">Admin Notice</h3>
           <ul className="text-[11px] text-muted-foreground space-y-2 list-disc pl-4">
              <li>등록된 전적은 즉시 홈페이지의 [엔트리] 및 [선수 프로필] 페이지에 반영됩니다.</li>
              <li>승리한 선수에게는 자동으로 승수가, 패배한 선수에게는 패수가 합산되지 않으므로 (현재 버전), 전적 입력 후 필요 시 별도의 데이터 동기화를 권장합니다.</li>
              <li>잘못 입력된 전투 정보는 Supabase 대시보드에서 직접 수정이 가능합니다.</li>
           </ul>
        </footer>
      </main>
    </div>
  );
}
