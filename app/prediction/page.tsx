import { TournamentPredictionClient } from "@/components/prediction/TournamentPredictionClient";
import { playerService } from "@/lib/player-service";
import { buildTournamentPredictionMatches } from "@/lib/tournament-prediction";
import { buildTournamentHomeTeamsFromStore } from "@/lib/tournament-home";
import { loadPredictionState } from "@/lib/prediction-store";
import { getBetPools } from "@/lib/prediction-bets";
import { getSetting } from "@/lib/site-settings";
import { frozenTierOf, parseTierFreeze, TIER_FREEZE_KEY } from "@/lib/tier-freeze";

export const revalidate = 60;

export const metadata = {
  title: "스타 대학대전 승부예측",
  description:
    "대학대전 경기별 승자를 미리 골라 투표하고, 결과가 공개되면 내 예측이 맞았는지 적중률로 확인할 수 있습니다.",
  keywords: ["스타 대학대전 승부예측", "스타 대학리그 예측", "스타호사가", "호사가"],
  alternates: { canonical: "/prediction" },
  openGraph: {
    title: "스타 대학대전 승부예측",
    description: "경기별 승자를 예측하고 결과 공개 후 적중 여부를 확인",
    url: "/prediction",
    type: "website",
  },
};

export default async function PredictionPage() {
  const livePlayers = await playerService.getCachedPlayersList();

  // 동결 KV 하나 때문에 승부예측 페이지가 죽으면 안 된다 — 실패는 삼키고 미동결로 취급.
  let freeze = null;
  try {
    freeze = parseTierFreeze(await getSetting(TIER_FREEZE_KEY));
  } catch (error) {
    console.error("failed to load tier freeze", error);
  }

  // 대회 기간에는 동결 티어가 공식이다. 조립 전에 값을 바꿔두면 아래 뱃지까지 그대로 따라온다.
  const allPlayers = livePlayers.map((player) => {
    const frozen = frozenTierOf(freeze, player.id, player.tier);
    return frozen ? { ...player, tier: frozen } : player;
  });

  const [state, tournamentTeams, betPools] = await Promise.all([
    loadPredictionState({
      includeVoteTotals: true,
    }),
    buildTournamentHomeTeamsFromStore(allPlayers),
    getBetPools().catch(() => []),
  ]);
  const matches = buildTournamentPredictionMatches(allPlayers, state, { tournamentTeams });

  return (
    <div className="min-h-screen bg-background text-foreground">
      <main className="mx-auto flex w-full max-w-[1500px] flex-col px-4 py-4 md:py-8 lg:px-8">
        <section className="hosaga-card mb-3 px-4 py-3 md:mb-4 md:px-5 md:py-4">
          <div className="ui-label hidden uppercase text-nzu-green md:block">
            Match Voting
          </div>
          <h1 className="text-xl font-bold text-white md:mt-2 md:text-3xl">승부예측</h1>
          <p className="mt-1.5 hidden text-sm font-medium text-white/55 md:block">
            로그인 후 경기별 승자를 예측하고, 결과 공개 후 내 예측 적중 여부를 확인할 수 있습니다.
          </p>
        </section>

        <TournamentPredictionClient initialMatches={matches} initialBetPools={betPools} />
      </main>
    </div>
  );
}
