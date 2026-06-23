import H2HLookup from "@/components/stats/H2HLookup";
import { mapPlayersToMatchupSummaries, packMatchupPlayersPayload } from "@/lib/matchup-helpers";
import { playerService } from "@/lib/player-service";
import { getUniversityOptionsFromDB } from "@/lib/university-metadata";

export const revalidate = 300;

export const metadata = {
  title: "HOSAGA - 엔트리",
  description: "대학별 선수 구성을 비교하고 엔트리를 정리하는 페이지",
};

export default async function EntryPage() {
  const players = await playerService.getCachedPlayersList();
  const matchupPlayers = mapPlayersToMatchupSummaries(players);
  const packedPlayersPayload = packMatchupPlayersPayload(matchupPlayers);
  const universityOptions = await getUniversityOptionsFromDB();

  return (
    <div className="min-h-screen bg-background text-foreground">
      <main className="mx-auto w-full max-w-[1800px] px-4 py-8 lg:px-8">
        <section className="hosaga-card mb-6 px-5 py-5">
          <div className="flex flex-col gap-2">
            <div className="ui-label uppercase text-nzu-green">
              Entry Tool
            </div>
            <h1 className="text-3xl font-bold tracking-tight text-white md:text-4xl">
              엔트리
            </h1>
            <p className="mt-1 text-sm font-medium text-white/55">
              대학별 선수 구성을 비교하고 H2H를 보면서 대진을 빠르게 정리할 수 있습니다.
            </p>
          </div>
        </section>

        <H2HLookup packedPlayersPayload={packedPlayersPayload} universityOptions={universityOptions} />
      </main>
    </div>
  );
}
