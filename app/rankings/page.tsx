
import { playerService } from "@/lib/player-service";
import { buildTournamentHomeTeams } from "@/lib/tournament-home";
import { TierBadge, RaceTag, type Race } from "@/components/ui/nzu-badges";
import { getUniversityLabel } from "@/lib/university-config";
import fs from "node:fs";
import path from "node:path";

export const dynamic = "force-dynamic";

export const metadata = {
  title: "NZU - 순위",
  description: "늪지대 NZU 대회 팀 및 선수 순위",
};

const STANDINGS_PATH = path.join(
  process.cwd(),
  "data",
  "metadata",
  "tournament_standings.v1.json"
);

type StandingData = {
  standings?: {
    teams?: Array<{ team_code: string; wins: number; losses: number }>;
    players?: Array<{ player_id: string; wins: number; losses: number }>;
  };
};

type PlayerRow = {
  id: string;
  name: string;
  teamName: string;
  university: string;
  race: string | null;
  tier: string | null;
  wins: number;
  losses: number;
};

function readStandings(): StandingData {
  if (!fs.existsSync(STANDINGS_PATH)) return {};
  try {
    return JSON.parse(fs.readFileSync(STANDINGS_PATH, "utf8").replace(/^\uFEFF/, ""));
  } catch {
    return {};
  }
}

function calculateRank<T extends { wins: number; losses: number }>(items: T[]) {
  // 1. 정렬: 승리 내림차순 -> 패배 오름차순
  const sorted = [...items].sort((a, b) => {
    if (b.wins !== a.wins) return b.wins - a.wins;
    return a.losses - b.losses;
  });

  // 2. 공동 순위 할당
  let lastRank = 1;
  return sorted.map((item, index) => {
    if (index > 0) {
      const prev = sorted[index - 1];
      if (item.wins !== prev.wins || item.losses !== prev.losses) {
        lastRank = index + 1;
      }
    }
    return { ...item, rank: lastRank };
  });
}

export default async function RankingsPage() {
  const players = await playerService.getAllPlayers();
  const teams = buildTournamentHomeTeams(players);
  const standings = readStandings();

  const teamStandingsMap = new Map(standings.standings?.teams?.map(t => [t.team_code, t]));
  const playerStandingsMap = new Map(standings.standings?.players?.map(p => [p.player_id, p]));

  // 팀 데이터 조립
  const teamRows = teams.map(t => {
    const s = teamStandingsMap.get(t.teamCode) || { wins: 0, losses: 0 };
    return {
      teamCode: t.teamCode,
      teamName: t.teamName,
      wins: s.wins,
      losses: s.losses,
    };
  });
  const rankedTeams = calculateRank(teamRows);

  const playerRows: PlayerRow[] = [];
  teams.forEach(t => {
    t.players.forEach(p => {
      const s = playerStandingsMap.get(p.id) || { wins: 0, losses: 0 };
      playerRows.push({
        id: p.id,
        name: p.name,
        teamName: t.teamName,
        university: getUniversityLabel(p.university),
        race: p.race,
        tier: p.tier,
        wins: s.wins,
        losses: s.losses,
      });
    });
  });

  const rankedPlayers = calculateRank(playerRows);

  return (
    <div className="min-h-screen bg-background">
      <main className="mx-auto w-full max-w-5xl px-4 py-12">
        <header className="mb-10 text-center">
          <h1 className="text-3xl font-black tracking-tight text-white md:text-4xl">
            팀 및 선수 순위
          </h1>
        </header>

        <section className="mb-12">
          <div className="mb-5 flex items-center gap-4">
            <h2 className="text-2xl font-black tracking-tight text-nzu-green md:text-3xl">팀 랭킹</h2>
            <div className="h-px flex-1 bg-gradient-to-r from-nzu-green/30 to-transparent" />
          </div>
          
          <div className="overflow-x-auto rounded-[2.5rem] border border-white/10 bg-white/5 backdrop-blur-xl">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="bg-white/5 border-b border-white/10">
                  <th className="px-8 py-5 text-lg font-black tracking-tight text-emerald-300">순위</th>
                  <th className="px-8 py-5 text-lg font-black tracking-tight text-emerald-300">대회팀명</th>
                  <th className="px-8 py-5 text-lg font-black tracking-tight text-emerald-300 text-center">승</th>
                  <th className="px-8 py-5 text-lg font-black tracking-tight text-emerald-300 text-center">패</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-white/5">
                {rankedTeams.map((t) => (
                  <tr key={t.teamCode} className="group hover:bg-white/5 transition-colors">
                    <td className="px-8 py-5">
                      <span className={`text-lg font-black italic ${t.rank <= 3 ? 'text-nzu-green' : 'text-muted-foreground/40'}`}>
                        {t.rank}
                      </span>
                    </td>
                    <td className="px-8 py-5">
                      <span className="text-base font-bold tracking-tight text-white">{t.teamName}</span>
                    </td>
                    <td className="px-8 py-5 text-center">
                      <span className="text-xl font-black text-white">{t.wins}</span>
                    </td>
                    <td className="px-8 py-5 text-center">
                      <span className="text-xl font-black text-muted-foreground/40">{t.losses}</span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>

        <section>
          <div className="mb-5 flex items-center gap-4">
            <h2 className="text-2xl font-black tracking-tight text-sky-300 md:text-3xl">선수 랭킹</h2>
            <div className="h-px flex-1 bg-gradient-to-r from-nzu-green/30 to-transparent" />
          </div>
          
          <div className="overflow-x-auto rounded-[2.5rem] border border-white/10 bg-white/5 backdrop-blur-xl">
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className="bg-white/5 border-b border-white/10">
                    <th className="px-8 py-5 text-lg font-black tracking-tight text-sky-300">순위</th>
                    <th className="px-8 py-5 text-lg font-black tracking-tight text-sky-300">선수명</th>
                    <th className="px-8 py-5 text-lg font-black tracking-tight text-sky-300">대회팀명</th>
                    <th className="px-8 py-5 text-lg font-black tracking-tight text-sky-300">소속대학</th>
                    <th className="px-8 py-5 text-lg font-black tracking-tight text-sky-300 text-center">종족</th>
                    <th className="px-8 py-5 text-lg font-black tracking-tight text-sky-300 text-center">티어</th>
                    <th className="px-8 py-5 text-lg font-black tracking-tight text-sky-300 text-center">승</th>
                    <th className="px-8 py-5 text-lg font-black tracking-tight text-sky-300 text-center">패</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-white/5">
                  {rankedPlayers.map((p) => (
                    <tr key={p.id} className="group hover:bg-white/5 transition-colors">
                      <td className="px-8 py-5">
                        <span className={`text-lg font-black italic ${p.rank <= 3 ? 'text-nzu-green' : 'text-muted-foreground/40'}`}>
                          {p.rank}
                        </span>
                      </td>
                      <td className="px-8 py-5">
                        <span className="text-base font-bold tracking-tight text-foreground">{p.name}</span>
                      </td>
                      <td className="px-8 py-5">
                        <span className="text-sm font-bold tracking-tight text-muted-foreground">{p.teamName}</span>
                      </td>
                      <td className="px-8 py-5">
                        <span className="text-sm font-bold tracking-tight text-muted-foreground/60">{p.university}</span>
                      </td>
                      <td className="px-8 py-5 text-center">
                        <div className="flex justify-center">
                          <RaceTag race={p.race as Race} size="sm" />
                        </div>
                      </td>
                      <td className="px-8 py-5 text-center">
                        <div className="flex justify-center">
                          <TierBadge tier={p.tier || "미정"} size="xs" />
                        </div>
                      </td>
                      <td className="px-8 py-5 text-center">
                        <span className="text-xl font-black text-white">{p.wins}</span>
                      </td>
                      <td className="px-8 py-5 text-center">
                        <span className="text-xl font-black text-muted-foreground/40">{p.losses}</span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
          </div>
        </section>

        <footer className="mt-20 pt-8 border-t border-border/10 text-center">
          <p className="text-[10px] text-muted-foreground/40 uppercase font-black tracking-[0.2em]">
            경기 결과가 마감된 후 순위 정보가 자동으로 갱신됩니다.
          </p>
        </footer>
      </main>
    </div>
  );
}
