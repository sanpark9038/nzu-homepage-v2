import fs from "fs";
import path from "path";
import Link from "next/link";

export const dynamic = "force-dynamic";

type RosterRow = {
  name: string;
  display_name?: string;
  tier: string;
  race: string;
  entity_id: string;
};

type TeamMeta = {
  code: string;
  teamName: string;
  teamNameEn: string;
  roster: RosterRow[];
};

type TeamTableReportRow = {
  name: string;
  tier: string;
  race: string;
  total: number;
  wins: number;
  losses: number;
  winRate: number;
};

type TeamTableReport = {
  generated_at?: string;
  team_code?: string;
  team_name?: string;
  source?: {
    roster_path?: string;
    record_path?: string;
    record_generated_at?: string;
  };
  rows?: TeamTableReportRow[];
};

type MatchRow = {
  date: string;
  opponent: string;
  opponentRace: string;
  map: string;
  result: string;
  memo: string;
};

type ReportMatch = {
  date?: string;
  opponent?: string;
  map?: string;
  is_win?: boolean;
  note?: string;
};

function parseCsvLine(line: string): string[] {
  const out: string[] = [];
  let cur = "";
  let inQuotes = false;
  for (let i = 0; i < line.length; i += 1) {
    const ch = line[i];
    if (inQuotes) {
      if (ch === '"') {
        if (line[i + 1] === '"') {
          cur += '"';
          i += 1;
        } else {
          inQuotes = false;
        }
      } else {
        cur += ch;
      }
    } else if (ch === ",") {
      out.push(cur);
      cur = "";
    } else if (ch === '"') {
      inQuotes = true;
    } else {
      cur += ch;
    }
  }
  out.push(cur);
  return out;
}

function readCsvRows(filePath: string): MatchRow[] {
  if (!fs.existsSync(filePath)) return [];
  const raw = fs.readFileSync(filePath, "utf8").replace(/^\uFEFF/, "");
  const lines = raw.split(/\r?\n/).filter((l) => l.length > 0);
  if (lines.length <= 1) return [];
  const headers = parseCsvLine(lines[0]);
  const idx = {
    date: headers.indexOf("날짜"),
    opponent: headers.indexOf("상대명"),
    opponentRace: headers.indexOf("상대종족"),
    map: headers.indexOf("맵"),
    result: headers.indexOf("경기결과(승/패)"),
    memo: headers.indexOf("메모"),
  };
  return lines.slice(1).map((line) => {
    const cols = parseCsvLine(line);
    return {
      date: cols[idx.date] || "",
      opponent: cols[idx.opponent] || "",
      opponentRace: cols[idx.opponentRace] || "",
      map: cols[idx.map] || "",
      result: cols[idx.result] || "",
      memo: cols[idx.memo] || "",
    };
  });
}

function safeFileName(name: string): string {
  return String(name).replace(/[<>:"/\\|?*\x00-\x1F]/g, "_");
}

function splitOpponent(text: string): { name: string; race: string } {
  const raw = String(text || "").trim();
  const m = raw.match(/^(.*)\(([^)]+)\)$/);
  if (!m) return { name: raw, race: "" };
  return { name: String(m[1] || "").trim(), race: String(m[2] || "").trim() };
}

function readJsonRows(filePath: string): MatchRow[] {
  if (!fs.existsSync(filePath)) return [];
  const raw = fs.readFileSync(filePath, "utf8").replace(/^\uFEFF/, "");
  const doc = JSON.parse(raw);
  const player = Array.isArray(doc?.players) ? doc.players[0] : null;
  const matches = Array.isArray(player?.matches) ? (player.matches as ReportMatch[]) : [];
  return matches.map((m) => {
    const opp = splitOpponent(String(m.opponent || ""));
    return {
      date: String(m.date || ""),
      opponent: opp.name,
      opponentRace: opp.race,
      map: String(m.map || ""),
      result: m.is_win ? "승" : "패",
      memo: String(m.note || ""),
    };
  });
}

function listTeamMetas(): TeamMeta[] {
  const root = process.cwd();
  const projectsDir = path.join(root, "data", "metadata", "projects");
  if (!fs.existsSync(projectsDir)) return [];
  const teams: TeamMeta[] = [];
  const dirs = fs
    .readdirSync(projectsDir, { withFileTypes: true })
    .filter((d) => d.isDirectory())
    .map((d) => d.name)
    .sort();
  for (const code of dirs) {
    const filePath = path.join(projectsDir, code, `players.${code}.v1.json`);
    if (!fs.existsSync(filePath)) continue;
    const json = JSON.parse(fs.readFileSync(filePath, "utf8").replace(/^\uFEFF/, ""));
    teams.push({
      code,
      teamName: String(json.team_name || code),
      teamNameEn: String(json.team_name_en || code.toUpperCase()),
      roster: Array.isArray(json.roster) ? json.roster : [],
    });
  }
  return teams;
}

function latestCsvPath(teamCode: string, name: string): string | null {
  const dir = path.join(process.cwd(), "tmp", "exports", teamCode, "csv");
  if (!fs.existsSync(dir)) return null;
  const files = fs
    .readdirSync(dir)
    .filter((f) => f.startsWith(`${name}_상세전적_`) && f.endsWith(".csv"))
    .map((f) => path.join(dir, f));
  if (!files.length) return null;
  files.sort((a, b) => fs.statSync(b).mtimeMs - fs.statSync(a).mtimeMs);
  return files[0];
}

function latestJsonPath(teamCode: string, teamName: string, name: string): string | null {
  const dir = path.join(process.cwd(), "tmp", "exports", teamCode, "json");
  if (!fs.existsSync(dir)) return null;
  const filePath = path.join(dir, `${safeFileName(teamName)}_${safeFileName(name)}_matches.json`);
  if (fs.existsSync(filePath)) return filePath;
  return null;
}

function readLatestMatches(teamCode: string, teamName: string, playerName: string): MatchRow[] {
  const json = latestJsonPath(teamCode, teamName, playerName);
  if (json) return readJsonRows(json);
  const csv = latestCsvPath(teamCode, playerName);
  return csv ? readCsvRows(csv) : [];
}

function readTeamTableReport(teamCode: string): TeamTableReport | null {
  const p = path.join(process.cwd(), "tmp", "reports", "team-roster-table", `${teamCode}.table.json`);
  if (!fs.existsSync(p)) return null;
  const raw = fs.readFileSync(p, "utf8").replace(/^\uFEFF/, "");
  return JSON.parse(raw) as TeamTableReport;
}

function summarize(rows: MatchRow[]) {
  const total = rows.length;
  const wins = rows.filter((r) => r.result === "승").length;
  const losses = total - wins;
  const winRate = total ? Number(((wins / total) * 100).toFixed(2)) : 0;
  return { total, wins, losses, winRate };
}

function topBy(rows: MatchRow[], key: (r: MatchRow) => string, limit: number): Array<{ key: string; count: number }> {
  const map = new Map<string, number>();
  for (const row of rows) {
    const k = key(row) || "Unknown";
    map.set(k, (map.get(k) || 0) + 1);
  }
  return [...map.entries()]
    .map(([k, v]) => ({ key: k, count: v }))
    .sort((a, b) => b.count - a.count || a.key.localeCompare(b.key, "ko"))
    .slice(0, limit);
}

export default async function DataLabPage({
  searchParams,
}: {
  searchParams: Promise<{ team?: string; player?: string }>;
}) {
  const params = await searchParams;
  const teams = listTeamMetas();
  const selectedTeam = teams.find((t) => t.code === params.team) || teams[0];
  const selectedPlayer =
    selectedTeam?.roster.find((r) => r.entity_id === params.player) || selectedTeam?.roster[0];
  const selectedTeamReport = selectedTeam ? readTeamTableReport(selectedTeam.code) : null;

  const teamRows =
    selectedTeam?.roster.map((p) => {
      const matches = readLatestMatches(selectedTeam.code, selectedTeam.teamName, p.name);
      const s = summarize(matches);
      return { ...p, ...s };
    }) || [];

  const playerMatches =
    selectedTeam && selectedPlayer
      ? readLatestMatches(selectedTeam.code, selectedTeam.teamName, selectedPlayer.name)
      : [];
  const playerSummary = summarize(playerMatches);
  const topMaps = topBy(playerMatches, (r) => r.map, 3);
  const topOpponents = topBy(playerMatches, (r) => r.opponent, 3);
  const recent3 = playerMatches.slice(0, 3);

  return (
    <main className="min-h-screen bg-background text-foreground p-6 md:p-10">
      <div className="max-w-7xl mx-auto space-y-8">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl md:text-3xl font-black tracking-tight">Data Lab (Temporary)</h1>
            <p className="text-sm text-muted-foreground">
              임시 검증 페이지입니다. 나중에 이름/구조를 자유롭게 변경할 수 있습니다.
            </p>
          </div>
          <Link href="/" className="text-sm underline text-nzu-green">
            홈으로
          </Link>
          <Link href="/admin/ops" className="text-sm underline text-nzu-green">
            Ops 보기
          </Link>
        </div>

        <form className="flex flex-col md:flex-row gap-3 md:items-end">
          <label className="flex flex-col gap-1 text-sm">
            Team
            <select name="team" defaultValue={selectedTeam?.code} className="bg-card border border-border rounded px-3 py-2">
              {teams.map((t) => (
                <option key={t.code} value={t.code}>
                  {t.teamName} ({t.teamNameEn})
                </option>
              ))}
            </select>
          </label>
          <label className="flex flex-col gap-1 text-sm">
            Player
            <select
              name="player"
              defaultValue={selectedPlayer?.entity_id}
              className="bg-card border border-border rounded px-3 py-2 min-w-[260px]"
            >
              {(selectedTeam?.roster || []).map((p) => (
                <option key={p.entity_id} value={p.entity_id}>
                  {p.display_name || p.name} ({p.name})
                </option>
              ))}
            </select>
          </label>
          <button className="bg-nzu-green text-white rounded px-4 py-2 text-sm font-bold h-[42px]">
            조회
          </button>
        </form>

        <section className="space-y-3">
          <h2 className="text-lg font-bold">Batch Team Table Snapshot</h2>
          <p className="text-xs text-muted-foreground">
            source: <code>npm run report:team:table:all</code>
          </p>
          {selectedTeamReport ? (
            <div className="border border-border rounded-lg p-4 bg-card space-y-3">
              <p className="text-sm text-muted-foreground">
                generated_at: {selectedTeamReport.generated_at || "-"} | record_generated_at:{" "}
                {selectedTeamReport.source?.record_generated_at || "-"}
              </p>
              <p className="text-xs text-muted-foreground">
                roster_path: {selectedTeamReport.source?.roster_path || "-"} | record_path:{" "}
                {selectedTeamReport.source?.record_path || "-"}
              </p>
              <div className="overflow-x-auto border border-border rounded-lg">
                <table className="w-full text-sm">
                  <thead className="bg-background">
                    <tr>
                      <th className="text-left p-2">이름</th>
                      <th className="text-left p-2">티어</th>
                      <th className="text-left p-2">종족</th>
                      <th className="text-right p-2">전적</th>
                      <th className="text-right p-2">승</th>
                      <th className="text-right p-2">패</th>
                      <th className="text-right p-2">승률(%)</th>
                    </tr>
                  </thead>
                  <tbody>
                    {(selectedTeamReport.rows || []).map((r) => (
                      <tr key={`${r.name}-${r.tier}-${r.race}`} className="border-t border-border/50">
                        <td className="p-2">{r.name}</td>
                        <td className="p-2">{r.tier}</td>
                        <td className="p-2">{r.race}</td>
                        <td className="p-2 text-right">{r.total}</td>
                        <td className="p-2 text-right">{r.wins}</td>
                        <td className="p-2 text-right">{r.losses}</td>
                        <td className="p-2 text-right">{Number(r.winRate || 0).toFixed(2)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          ) : (
            <p className="text-sm text-muted-foreground">
              배치 스냅샷이 없습니다. <code>npm run report:team:table:all</code> 실행 후 새로고침하세요.
            </p>
          )}
        </section>

        <section className="space-y-3">
          <h2 className="text-lg font-bold">Team Roster Summary</h2>
          <div className="overflow-x-auto border border-border rounded-lg">
            <table className="w-full text-sm">
              <thead className="bg-card">
                <tr>
                  <th className="text-left p-2">표시명</th>
                  <th className="text-left p-2">실명</th>
                  <th className="text-left p-2">티어</th>
                  <th className="text-left p-2">종족</th>
                  <th className="text-right p-2">총전적</th>
                  <th className="text-right p-2">승</th>
                  <th className="text-right p-2">패</th>
                </tr>
              </thead>
              <tbody>
                {teamRows.map((r) => (
                  <tr key={r.entity_id} className="border-t border-border/50">
                    <td className="p-2">{r.display_name || r.name}</td>
                    <td className="p-2 text-muted-foreground">{r.name}</td>
                    <td className="p-2">{r.tier}</td>
                    <td className="p-2">{r.race}</td>
                    <td className="p-2 text-right">{r.total}</td>
                    <td className="p-2 text-right">{r.wins}</td>
                    <td className="p-2 text-right">{r.losses}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>

        <section className="grid md:grid-cols-3 gap-4">
          <div className="border border-border rounded-lg p-4 bg-card">
            <h3 className="font-bold mb-2">Selected Player</h3>
            <p className="text-sm">
              {(selectedPlayer?.display_name || selectedPlayer?.name) ?? "-"}{" "}
              <span className="text-muted-foreground">({selectedPlayer?.name || "-"})</span>
            </p>
            <p className="text-sm text-muted-foreground">티어 {selectedPlayer?.tier || "-"} · {selectedPlayer?.race || "-"}</p>
            <p className="text-sm mt-2">총 {playerSummary.total} / {playerSummary.wins}승 {playerSummary.losses}패 ({playerSummary.winRate}%)</p>
          </div>
          <div className="border border-border rounded-lg p-4 bg-card">
            <h3 className="font-bold mb-2">Top Maps</h3>
            <ul className="text-sm space-y-1">
              {topMaps.map((m) => (
                <li key={m.key}>{m.key} ({m.count})</li>
              ))}
            </ul>
          </div>
          <div className="border border-border rounded-lg p-4 bg-card">
            <h3 className="font-bold mb-2">Top Opponents</h3>
            <ul className="text-sm space-y-1">
              {topOpponents.map((o) => (
                <li key={o.key}>{o.key} ({o.count})</li>
              ))}
            </ul>
          </div>
        </section>

        <section className="space-y-3">
          <h2 className="text-lg font-bold">Recent 3 Matches</h2>
          <div className="overflow-x-auto border border-border rounded-lg">
            <table className="w-full text-sm">
              <thead className="bg-card">
                <tr>
                  <th className="text-left p-2">날짜</th>
                  <th className="text-left p-2">상대</th>
                  <th className="text-left p-2">종족</th>
                  <th className="text-left p-2">맵</th>
                  <th className="text-left p-2">결과</th>
                  <th className="text-left p-2">메모</th>
                </tr>
              </thead>
              <tbody>
                {recent3.map((m, i) => (
                  <tr key={`${m.date}-${m.opponent}-${i}`} className="border-t border-border/50">
                    <td className="p-2">{m.date}</td>
                    <td className="p-2">{m.opponent}</td>
                    <td className="p-2">{m.opponentRace}</td>
                    <td className="p-2">{m.map}</td>
                    <td className="p-2">{m.result}</td>
                    <td className="p-2">{m.memo}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      </div>
    </main>
  );
}
