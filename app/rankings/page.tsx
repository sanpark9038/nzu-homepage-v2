
import { playerService } from "@/lib/player-service";
import { buildTournamentHomeTeamsFromStore } from "@/lib/tournament-home";
import { TierBadge, RaceTag, type Race } from "@/components/ui/nzu-badges";
import { getUniversityLabel } from "@/lib/university-config";
import fs from "node:fs";
import path from "node:path";

export const revalidate = 300;

export const metadata = {
  title: "HOSAGA - 순위",
  description: "호사가 HOSAGA 대회 팀 및 선수 순위",
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
  const players = await playerService.getCachedPlayersList();
  const teams = await buildTournamentHomeTeamsFromStore(players);
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
          
          <div className="rk-shell">
            <table className="rk-table">
              <thead>
                <tr className="rk-hr">
                  <th className="rk-th rk-team">순위</th>
                  <th className="rk-th rk-team">대회팀명</th>
                  <th className="rk-th rk-team rk-c">승</th>
                  <th className="rk-th rk-team rk-c">패</th>
                </tr>
              </thead>
              <tbody className="rk-body">
                {rankedTeams.map((t) => (
                  <tr key={t.teamCode} className="rk-row">
                    <td className="rk-td">
                      <span className={`rk-r ${t.rank <= 3 ? "rk-r-top" : "rk-r-muted"}`}>
                        {t.rank}
                      </span>
                    </td>
                    <td className="rk-td">
                      <span className="rk-tn">{t.teamName}</span>
                    </td>
                    <td className="rk-td rk-c">
                      <span className="rk-win">{t.wins}</span>
                    </td>
                    <td className="rk-td rk-c">
                      <span className="rk-loss">{t.losses}</span>
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
          
          <div className="rk-shell">
              <table className="rk-table">
                <thead>
                  <tr className="rk-hr">
                    <th className="rk-th rk-player">순위</th>
                    <th className="rk-th rk-player">선수명</th>
                    <th className="rk-th rk-player">대회팀명</th>
                    <th className="rk-th rk-player">소속대학</th>
                    <th className="rk-th rk-player rk-c">종족</th>
                    <th className="rk-th rk-player rk-c">티어</th>
                    <th className="rk-th rk-player rk-c">승</th>
                    <th className="rk-th rk-player rk-c">패</th>
                  </tr>
                </thead>
                <tbody className="rk-body">
                  {rankedPlayers.map((p) => (
                    <tr key={p.id} className="rk-row">
                      <td className="rk-td">
                        <span className={`rk-r ${p.rank <= 3 ? "rk-r-top" : "rk-r-muted"}`}>
                          {p.rank}
                        </span>
                      </td>
                      <td className="rk-td">
                        <span className="rk-pn">{p.name}</span>
                      </td>
                      <td className="rk-td">
                        <span className="rk-muted">{p.teamName}</span>
                      </td>
                      <td className="rk-td">
                        <span className="rk-uni">{p.university}</span>
                      </td>
                      <td className="rk-td rk-c">
                        <div className="rk-cf">
                          <RaceTag race={p.race as Race} size="sm" />
                        </div>
                      </td>
                      <td className="rk-td rk-c">
                        <div className="rk-cf">
                          <TierBadge tier={p.tier || "미정"} size="xs" />
                        </div>
                      </td>
                      <td className="rk-td rk-c">
                        <span className="rk-win">{p.wins}</span>
                      </td>
                      <td className="rk-td rk-c">
                        <span className="rk-loss">{p.losses}</span>
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
