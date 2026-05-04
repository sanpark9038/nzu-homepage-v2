import { TournamentPredictionClient } from "@/components/prediction/TournamentPredictionClient";
import { playerService } from "@/lib/player-service";
import { buildTournamentPredictionMatches } from "@/lib/tournament-prediction";

export const revalidate = 60;

export default async function PredictionPage() {
  const allPlayers = await playerService.getCachedPlayersList();
  const matches = buildTournamentPredictionMatches(allPlayers);

  return (
    <div className="min-h-screen bg-background text-foreground">
      <main className="mx-auto flex w-full max-w-[1800px] flex-col px-4 py-8 lg:px-8">
        <section className="mb-4 rounded-[1.35rem] border border-white/8 bg-[linear-gradient(180deg,rgba(9,18,19,0.92),rgba(6,10,11,0.88))] px-5 py-4 shadow-[0_18px_50px_rgba(0,0,0,0.18)]">
          <div className="text-[11px] font-black uppercase tracking-[0.24em] text-nzu-green">
            Match Voting
          </div>
          <h1 className="mt-2 text-2xl font-black tracking-tighter text-white md:text-3xl">
            승부예측
          </h1>
          <p className="mt-1 text-sm font-bold text-white/48">
            경기 시작 30분 전까지 참여 가능합니다.
          </p>
        </section>

        <TournamentPredictionClient initialMatches={matches} />
      </main>
    </div>
  );
}
