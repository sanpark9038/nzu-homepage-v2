import { TournamentPredictionClient } from "@/components/prediction/TournamentPredictionClient";
import { playerService } from "@/lib/player-service";
import { buildTournamentPredictionMatches } from "@/lib/tournament-prediction";
import { loadPredictionState } from "@/lib/prediction-store";

export const revalidate = 60;

export default async function PredictionPage() {
  const allPlayers = await playerService.getCachedPlayersList();
  const state = await loadPredictionState();
  const matches = buildTournamentPredictionMatches(allPlayers, state);

  return (
    <div className="min-h-screen bg-background text-foreground">
      <main className="mx-auto flex w-full max-w-[1500px] flex-col px-4 py-8 lg:px-8">
        <section className="mb-4 rounded-xl border border-white/8 bg-[linear-gradient(180deg,rgba(9,18,19,0.94),rgba(6,10,11,0.9))] px-5 py-4 shadow-[0_18px_50px_rgba(0,0,0,0.18)]">
          <div className="text-[11px] font-black uppercase tracking-[0.24em] text-nzu-green">
            Match Voting
          </div>
          <h1 className="mt-2 text-2xl font-black text-white md:text-3xl">승부예측</h1>
          <p className="mt-1 text-sm font-bold text-white/48">
            로그인 후 경기별 승자를 예측하고, 결과 공개 후 내 예측 적중 여부를 확인할 수 있습니다.
          </p>
        </section>

        <TournamentPredictionClient initialMatches={matches} />
      </main>
    </div>
  );
}
