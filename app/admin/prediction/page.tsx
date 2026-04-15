import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { AdminNav } from "@/components/admin/AdminNav";
import { playerService } from "@/lib/player-service";
import { ADMIN_SESSION_COOKIE, isValidAdminSession } from "@/lib/admin-auth";
import { buildTournamentHomeTeams } from "@/lib/tournament-home";
import { readPredictionConfig } from "@/lib/tournament-prediction";
import { PredictionMatchAdmin } from "./PredictionMatchAdmin";
import LogoutButton from "../ops/LogoutButton";

export const metadata = {
  title: "HOSAGA Admin - 승부예측 설정",
};

export default async function AdminPredictionPage() {
  const cookieStore = await cookies();
  const sessionValue = cookieStore.get(ADMIN_SESSION_COOKIE)?.value;
  if (!isValidAdminSession(sessionValue)) {
    redirect("/admin/login?next=/admin/prediction");
  }

  const players = await playerService.getAllPlayers();
  const teams = buildTournamentHomeTeams(players);
  const config = readPredictionConfig();

  const teamList = teams.map((t) => ({
    teamCode: t.teamCode,
    teamName: t.teamName,
  }));

  return (
    <div className="min-h-screen bg-background">
      <main className="max-w-4xl mx-auto w-full px-4 py-12">
        <AdminNav />
        <header className="mb-12 flex justify-between items-start">
          <div>
            <div className="flex items-center gap-2 mb-2">
               <span className="px-2 py-0.5 bg-nzu-green/10 text-nzu-green border border-nzu-green/20 rounded text-[10px] font-black uppercase tracking-widest">
                  Admin Control
               </span>
            </div>
            <h1 className="text-4xl font-black tracking-tighter uppercase italic">
               Prediction <span className="gradient-text">Admin</span>
            </h1>
            <p className="text-muted-foreground text-sm mt-1">대진 및 경기 시간 설정</p>
          </div>
          <LogoutButton />
        </header>

        <section className="bg-card border border-border/40 rounded-[2.5rem] p-8 md:p-12 shadow-2xl relative overflow-hidden">
           <div className="absolute top-0 right-0 w-64 h-64 bg-nzu-green/5 blur-[100px] rounded-full -translate-y-1/2 translate-x-1/2" />
           
           <div className="relative">
              <PredictionMatchAdmin initialMatches={config.matches || []} teams={teamList} />
           </div>
        </section>

        <footer className="mt-12 p-6 border border-border/20 rounded-2xl bg-muted/5">
           <h3 className="text-xs font-black uppercase tracking-widest mb-3 opacity-60">Admin Notice</h3>
           <ul className="text-[11px] text-muted-foreground space-y-2 list-disc pl-4">
              <li>수정된 내용은 즉시 반영됩니다.</li>
              <li>경기 시간은 한국 시간(KST) 기준입니다.</li>
              <li>경기 시작 30분 전부터 투표가 마감됩니다.</li>
           </ul>
        </footer>
      </main>
    </div>
  );
}
