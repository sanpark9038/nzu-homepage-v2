import Link from "next/link";
import { playerService } from "@/lib/player-service";
import { RaceTag, TierBadge, type Race } from "@/components/ui/nzu-badges";
import PlayerSearchForm from "./PlayerSearchForm";
import PlayerSearchResult from "./PlayerSearchResult";

export const revalidate = 60;

type SearchParams = {
  query?: string;
};

function normalizeText(value: string) {
  return String(value || "").trim().toLowerCase();
}

function normalizeRaceValue(race: string | null | undefined): Race {
  const raw = String(race || "").trim().toUpperCase();
  if (raw.startsWith("Z")) return "Z";
  if (raw.startsWith("P")) return "P";
  return "T";
}

const TEMP_RECENT_WIN_RATE = "58%";
const TEMP_RECENT_WINS = 7;
const TEMP_RECENT_LOSSES = 5;
const TEMP_RECENT_FORM = ["승", "승", "패", "승", "패"] as const;

export default async function PlayerIndexPage({
  searchParams,
}: {
  searchParams?: Promise<SearchParams>;
}) {
  const params = searchParams ? await searchParams : undefined;
  const query = String(params?.query || "").trim();
  const hasQuery = query.length > 0;

  let exactMatch: Awaited<ReturnType<typeof playerService.searchPlayers>>[number] | null = null;
  let candidates: Awaited<ReturnType<typeof playerService.searchPlayers>> = [];
  let exactMatchMatches: Awaited<ReturnType<typeof playerService.getPlayerMatches>> = [];

  if (hasQuery) {
    const results = await playerService.searchPlayers(query);
    const exact = results.find((player) => normalizeText(player.name) === normalizeText(query)) || null;
    exactMatch = exact;
    candidates = exact ? results.filter((player) => player.id !== exact.id) : results;
    if (exact) {
      exactMatchMatches = await playerService.getPlayerMatches(exact.id, 8);
    }
  }

  return (
    <main className="min-h-[calc(100vh-4rem)] bg-background px-6 py-4 text-foreground md:px-10">
      <div className="mx-auto flex max-w-5xl flex-col items-center pt-4 md:pt-5">
        <section
          className="w-full max-w-4xl overflow-hidden rounded-[2rem] border border-white/8 bg-[linear-gradient(180deg,rgba(8,17,18,0.94),rgba(6,10,11,0.92))] px-6 py-4 shadow-[0_24px_80px_rgba(0,0,0,0.34)] md:px-8 md:py-5"
        >
          <div className="text-center">
            <h1 className="text-[1.9rem] font-[1000] tracking-tighter italic text-white md:text-[2.45rem]">
              선수 <span className="text-nzu-green drop-shadow-[0_0_15px_#00ffa344]">검색</span>
            </h1>
            <p className="mx-auto mt-1 max-w-xl text-[0.88rem] font-semibold text-white/45 md:text-[0.92rem]">
              선수 이름을 입력하면 전적과 통계를 확인할 수 있습니다.
            </p>
          </div>

          <PlayerSearchForm initialQuery={query} />

          {hasQuery ? (
            <div className="mt-4 space-y-4">
              {exactMatch ? (
                <PlayerSearchResult
                  player={exactMatch}
                  matches={exactMatchMatches}
                  recentWinRate={TEMP_RECENT_WIN_RATE}
                  recentWins={TEMP_RECENT_WINS}
                  recentLosses={TEMP_RECENT_LOSSES}
                  recentForm={TEMP_RECENT_FORM}
                />
              ) : null}

              {!exactMatch && candidates.length > 0 ? (
                <div className="rounded-[1.35rem] border border-white/8 bg-white/[0.03] px-5 py-5">
                  <p className="text-sm font-[1000] text-white">정확히 일치하는 선수는 없지만, 비슷한 결과가 있습니다.</p>
                </div>
              ) : null}

              {candidates.length > 0 ? (
                <div className="space-y-2">
                  {candidates.slice(0, 8).map((player) => (
                    <Link
                      key={player.id}
                      href={`/player?query=${encodeURIComponent(player.name)}`}
                      className="flex items-center justify-between gap-3 rounded-[1.15rem] border border-white/8 bg-white/[0.03] px-4 py-3 transition-all hover:border-nzu-green/30 hover:bg-nzu-green/[0.05]"
                    >
                      <div className="min-w-0">
                        <div className="flex flex-wrap items-center gap-2">
                          <p className="text-sm font-[1000] text-white">{player.name}</p>
                          <RaceTag race={normalizeRaceValue(player.race)} size="sm" />
                          <TierBadge tier={player.tier || "미정"} size="sm" />
                        </div>
                        <p className="mt-1 truncate text-xs text-white/42">
                          {player.university || "무소속"}
                        </p>
                      </div>
                      <span className="shrink-0 text-xs font-[1000] text-nzu-green">선택</span>
                    </Link>
                  ))}
                </div>
              ) : null}

              {!exactMatch && candidates.length === 0 ? (
                <div className="rounded-[1.35rem] border border-dashed border-white/10 px-5 py-6 text-center text-sm text-white/38">
                  검색 결과가 없습니다.
                </div>
              ) : null}
            </div>
          ) : null}
        </section>
      </div>
    </main>
  );
}
