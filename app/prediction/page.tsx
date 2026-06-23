import { TournamentPredictionClient } from "@/components/prediction/TournamentPredictionClient";
import { playerService } from "@/lib/player-service";
import { buildTournamentPredictionMatches } from "@/lib/tournament-prediction";
import { buildTournamentHomeTeamsFromStore } from "@/lib/tournament-home";
import { loadPredictionState } from "@/lib/prediction-store";

export const revalidate = 60;

export default async function PredictionPage() {
  const allPlayers = await playerService.getCachedPlayersList();
  const [state, tournamentTeams] = await Promise.all([
    loadPredictionState({
      includeVoteTotals: true,
    }),
    buildTournamentHomeTeamsFromStore(allPlayers),
  ]);
  const matches = buildTournamentPredictionMatches(allPlayers, state, { tournamentTeams });

  return (
    <div className="min-h-screen bg-background text-foreground">
      <main className="mx-auto flex w-full max-w-[1500px] flex-col px-4 py-8 lg:px-8">
        <section className="hosaga-card mb-4 px-5 py-4">
          <div className="ui-label uppercase text-nzu-green">
            Match Voting
          </div>
          <h1 className="mt-2 text-2xl font-bold text-white md:text-3xl">승부예측</h1>
          <p className="mt-1.5 text-sm font-medium text-white/55">
            로그인 후 경기별 승자를 예측하고, 결과 공개 후 내 예측 적중 여부를 확인할 수 있습니다.
          </p>
        </section>

        <TournamentPredictionClient initialMatches={matches} />
      </main>
    </div>
  );
}
