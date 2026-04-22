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
      <main className="mx-auto w-full max-w-4xl px-4 py-12">
        <AdminNav />
        <header className="mb-12 flex items-start justify-between">
          <div>
            <div className="mb-2 flex items-center gap-2">
              <span className="rounded border border-nzu-green/20 bg-nzu-green/10 px-2 py-0.5 text-[10px] font-black uppercase tracking-widest text-nzu-green">
                Admin Control
              </span>
            </div>
            <h1 className="text-4xl font-black uppercase italic tracking-tighter">
              Prediction <span className="gradient-text">Admin</span>
            </h1>
            <p className="mt-1 text-sm text-muted-foreground">대진 및 경기 시간을 설정합니다.</p>
          </div>
          <LogoutButton />
        </header>

        <section className="relative overflow-hidden rounded-[2.5rem] border border-border/40 bg-card p-8 shadow-2xl md:p-12">
          <div className="absolute right-0 top-0 h-64 w-64 translate-x-1/2 -translate-y-1/2 rounded-full bg-nzu-green/5 blur-[100px]" />

          <div className="relative">
            <PredictionMatchAdmin initialMatches={config.matches || []} teams={teamList} />
          </div>
        </section>

        <footer className="mt-12 rounded-2xl border border-border/20 bg-muted/5 p-6">
          <h3 className="mb-3 text-xs font-black uppercase tracking-widest opacity-60">Admin Notice</h3>
          <ul className="list-disc space-y-2 pl-4 text-[11px] text-muted-foreground">
            <li>수정된 내용은 즉시 반영됩니다.</li>
            <li>경기 시간은 한국 시간(KST) 기준입니다.</li>
            <li>경기 시작 30분 전부터 투표가 마감됩니다.</li>
          </ul>
        </footer>
      </main>
    </div>
  );
}
