import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { AdminNav } from "@/components/admin/AdminNav";
import { playerService } from "@/lib/player-service";
import { ADMIN_SESSION_COOKIE, isValidAdminSession } from "@/lib/admin-auth";
import { buildPredictionUniversityTeams } from "@/lib/prediction-admin-teams";
import { loadPredictionState } from "@/lib/prediction-store";
import { PredictionMatchAdmin } from "./PredictionMatchAdmin";
import LogoutButton from "../ops/LogoutButton";

export const metadata = {
  title: "HOSAGA Admin - 승부예측 관리",
};

export default async function AdminPredictionPage() {
  const cookieStore = await cookies();
  const sessionValue = cookieStore.get(ADMIN_SESSION_COOKIE)?.value;
  if (!isValidAdminSession(sessionValue)) {
    redirect("/admin/login?next=/admin/prediction");
  }

  const players = await playerService.getCachedPlayersList();
  const teams = buildPredictionUniversityTeams(players);
  const predictionState = await loadPredictionState();

  const playerList = players.map((player) => ({
    id: player.id,
    name: player.name,
    nickname: player.nickname,
    race: player.race,
    tier: player.tier,
  }));

  const teamList = teams.map((team) => ({
    teamCode: team.teamCode,
    teamName: team.teamName,
    players: team.players.map((player) => ({
      id: player.id,
      name: player.name,
      nickname: player.nickname,
      race: player.race,
      tier: player.tier,
    })),
  }));

  return (
    <div className="min-h-screen bg-background text-foreground">
      <main className="mx-auto w-full max-w-7xl px-4 py-10 md:py-12">
        <AdminNav />
        <header className="mb-8 flex flex-wrap items-start justify-between gap-5">
          <div>
            <div className="mb-2 flex items-center gap-2">
              <span className="rounded border border-nzu-green/25 bg-nzu-green/10 px-2 py-0.5 text-[10px] font-black uppercase tracking-widest text-nzu-green">
                Admin Control
              </span>
            </div>
            <h1 className="text-3xl font-black text-white md:text-4xl">
              승부예측 관리
            </h1>
            <p className="mt-2 max-w-3xl text-sm font-bold text-white/48">
              팀전과 개인전 예측을 만들고, 임시저장, 투표 시작, 마감, 결과 공개 흐름을 관리합니다.
            </p>
          </div>
          <LogoutButton />
        </header>

        <PredictionMatchAdmin
          initialMatches={predictionState.matches}
          initialVotes={predictionState.votes}
          teams={teamList}
          players={playerList}
        />

        <footer className="mt-8 rounded-xl border border-white/8 bg-white/[0.035] p-5">
          <h3 className="mb-3 text-sm font-black text-white">운영 메모</h3>
          <ul className="space-y-2 text-sm font-bold text-white/48">
            <li>임시저장은 public 화면에 보이지 않습니다.</li>
            <li>투표 시작 후 사용자는 로그인한 상태에서만 예측할 수 있습니다.</li>
            <li>
              팀전의 엔트리 매치업은 안내 정보이며, 세부 경기 승자 예측은 개인전 예측으로 별도 등록합니다.
            </li>
            <li>같은 예측 안에서는 같은 선수를 한 번만 등록할 수 있습니다.</li>
          </ul>
        </footer>
      </main>
    </div>
  );
}
