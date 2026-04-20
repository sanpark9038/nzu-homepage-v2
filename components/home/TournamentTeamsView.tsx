import Link from "next/link";

import { PlayerCard } from "@/components/players/PlayerCard";
import { playerService } from "@/lib/player-service";
import { buildTournamentHomeTeams } from "@/lib/tournament-home";

export async function TournamentTeamsView({
  selectedTeamCode = "",
  basePath = "/teams",
}: {
  selectedTeamCode?: string;
  basePath?: string;
}) {
  const allPlayers = await playerService.getCachedPlayersList();
  const teams = buildTournamentHomeTeams(allPlayers);
  const activeTeam = teams.find((team) => team.teamCode === selectedTeamCode) || teams[0] || null;

  return (
    <div className="min-h-screen bg-background text-foreground">
      <main className="mx-auto flex w-full max-w-[1800px] flex-col px-4 py-8 lg:px-8">
        <section className="mb-6 rounded-[1.4rem] border border-white/8 bg-[linear-gradient(180deg,rgba(9,18,19,0.92),rgba(6,10,11,0.88))] px-5 py-5">
          <div className="flex flex-col gap-2">
            <div className="text-[11px] font-black uppercase tracking-[0.22em] text-nzu-green">Tournament Roster</div>
            <h1 className="text-3xl font-black tracking-tighter text-white md:text-4xl">참가팀 명단</h1>
            <p className="text-sm font-bold text-white/52">팀을 선택하면 해당 팀의 선수 명단을 빠르게 확인할 수 있습니다.</p>
          </div>
        </section>

        <section className="mb-6">
          <div className="flex flex-wrap gap-3">
            {teams.map((team) => {
              const isActive = team.teamCode === activeTeam?.teamCode;
              const targetHref = isActive ? basePath : `${basePath}?team=${encodeURIComponent(team.teamCode)}`;

              return (
                <Link
                  key={team.teamCode}
                  href={targetHref}
                  className={[
                    "rounded-full border px-5 py-2.5 text-sm font-[1000] tracking-tight transition-all",
                    isActive
                      ? "border-nzu-green bg-nzu-green text-black"
                      : "border-white/10 bg-white/[0.03] text-white/70 hover:border-white/20 hover:bg-white/[0.06] hover:text-white",
                  ].join(" ")}
                >
                  {team.teamName}
                </Link>
              );
            })}
          </div>
        </section>

        <section className="space-y-5">
          <div className="flex flex-col gap-2 border-b border-white/5 pb-4 md:flex-row md:items-end md:justify-between">
            <div>
              <div className="text-[10px] font-black uppercase tracking-[0.2em] text-white/28">Selected Team</div>
              <h2 className="mt-1 text-2xl font-black tracking-tighter text-white md:text-3xl">{activeTeam?.teamName || "팀 배정 전"}</h2>
            </div>
            <div className="text-[11px] font-black uppercase tracking-[0.18em] text-white/32">선수 {activeTeam?.players.length || 0}명</div>
          </div>

          {activeTeam && activeTeam.players.length > 0 ? (
            <div className="mx-auto grid w-full max-w-[1400px] place-items-center grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
              {activeTeam.players.map((player) => (
                <PlayerCard
                  key={player.id}
                  player={player}
                  isCaptain={Boolean(player.isCaptain)}
                  showQuickH2H={false}
                  variant="home"
                  className="w-full max-w-[276px]"
                />
              ))}
            </div>
          ) : (
            <div className="rounded-[1.3rem] border border-dashed border-white/10 bg-white/[0.02] px-6 py-10 text-center text-sm font-bold text-white/32">
              아직 팀원이 정해지지 않았습니다.
            </div>
          )}
        </section>
      </main>
    </div>
  );
}
