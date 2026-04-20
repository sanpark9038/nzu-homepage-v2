import H2HLookup from "@/components/stats/H2HLookup";
import { mapPlayersToMatchupSummaries } from "@/lib/matchup-helpers";
import { playerService } from "@/lib/player-service";
import { getUniversityOptions } from "@/lib/university-metadata";

export const revalidate = 300;

export const metadata = {
  title: "HOSAGA - 엔트리",
  description: "대학별 선수 구성을 비교하고 엔트리를 정리하는 페이지",
};

export default async function EntryPage() {
  const players = await playerService.getCachedPlayersList();
  const matchupPlayers = mapPlayersToMatchupSummaries(players);
  const universityOptions = getUniversityOptions();

  return (
    <div className="min-h-screen bg-background text-foreground">
      <main className="mx-auto w-full max-w-[1800px] px-4 py-8 lg:px-8">
        <section className="mb-6 rounded-[1.4rem] border border-white/8 bg-[linear-gradient(180deg,rgba(9,18,19,0.92),rgba(6,10,11,0.88))] px-5 py-5">
          <div className="flex flex-col gap-2">
            <div className="text-[11px] font-black uppercase tracking-[0.22em] text-nzu-green">
              Entry Tool
            </div>
            <h1 className="text-3xl font-black tracking-tighter text-white md:text-4xl">
              엔트리
            </h1>
            <p className="text-sm font-bold text-white/52">
              대학별 선수 구성을 비교하고 H2H를 보면서 대진을 빠르게 정리할 수 있습니다.
            </p>
          </div>
        </section>

        <H2HLookup players={matchupPlayers} universityOptions={universityOptions} />
      </main>
    </div>
  );
}
