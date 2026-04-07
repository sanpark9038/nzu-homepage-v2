import { AdminNav } from "@/components/admin/AdminNav";
import { ADMIN_SESSION_COOKIE, isValidAdminSession } from "@/lib/admin-auth";
import { playerService } from "@/lib/player-service";
import { buildTournamentHomeTeams } from "@/lib/tournament-home";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import fs from "node:fs";
import path from "node:path";
import LogoutButton from "../ops/LogoutButton";
import StandingAdmin from "./StandingAdmin";

export const metadata = {
  title: "NZU Admin - 순위 설정",
};

const STANDINGS_PATH = path.join(
  process.cwd(),
  "data",
  "metadata",
  "tournament_standings.v1.json"
);

function readStandings() {
  if (!fs.existsSync(STANDINGS_PATH)) return {};
  try {
    return JSON.parse(fs.readFileSync(STANDINGS_PATH, "utf8").replace(/^\uFEFF/, ""));
  } catch {
    return {};
  }
}

export default async function AdminRankingPage() {
  const cookieStore = await cookies();
  const sessionValue = cookieStore.get(ADMIN_SESSION_COOKIE)?.value;
  if (!isValidAdminSession(sessionValue)) {
    redirect("/admin/login?next=/admin/rankings");
  }

  const players = await playerService.getAllPlayers();
  const teams = buildTournamentHomeTeams(players);
  const standings = readStandings();

  return (
    <div className="min-h-screen bg-background">
      <main className="mx-auto w-full max-w-5xl px-4 py-12">
        <AdminNav />
        <header className="mb-12 flex justify-between items-start">
          <div>
            <div className="flex items-center gap-2 mb-2">
              <span className="px-2 py-0.5 bg-nzu-green/10 text-nzu-green border border-nzu-green/20 rounded text-[10px] font-black uppercase tracking-widest">
                Admin Control
              </span>
            </div>
            <h1 className="text-4xl font-black tracking-tighter uppercase italic">
              Rankings <span className="gradient-text">Admin</span>
            </h1>
            <p className="text-muted-foreground text-sm mt-1">대회 승패 및 순위 데이터 관리</p>
          </div>
          <LogoutButton />
        </header>

        <section className="bg-card border border-border/40 rounded-[2.5rem] p-8 md:p-12 shadow-2xl relative overflow-hidden">
          <div className="absolute top-0 right-0 w-64 h-64 bg-nzu-green/5 blur-[100px] rounded-full -translate-y-1/2 translate-x-1/2" />

          <div className="relative">
            <StandingAdmin teams={teams} initialStandings={standings} />
          </div>
        </section>
      </main>
    </div>
  );
}
