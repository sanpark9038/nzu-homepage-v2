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
  title: "HOSAGA Admin - 순위 설정",
};

const STANDINGS_PATH = path.join(process.cwd(), "data", "metadata", "tournament_standings.v1.json");

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
        <header className="mb-12 flex items-start justify-between">
          <div>
            <div className="mb-2 flex items-center gap-2">
              <span className="rounded border border-nzu-green/20 bg-nzu-green/10 px-2 py-0.5 text-[10px] font-black uppercase tracking-widest text-nzu-green">
                Admin Control
              </span>
            </div>
            <h1 className="text-4xl font-black uppercase italic tracking-tighter">
              Rankings <span className="gradient-text">Admin</span>
            </h1>
            <p className="mt-1 text-sm text-muted-foreground">대회 승패 및 순위 데이터를 관리합니다.</p>
          </div>
          <LogoutButton />
        </header>

        <section className="relative overflow-hidden rounded-[2.5rem] border border-border/40 bg-card p-8 shadow-2xl md:p-12">
          <div className="absolute right-0 top-0 h-64 w-64 translate-x-1/2 -translate-y-1/2 rounded-full bg-nzu-green/5 blur-[100px]" />

          <div className="relative">
            <StandingAdmin teams={teams} initialStandings={standings} />
          </div>
        </section>
      </main>
    </div>
  );
}
