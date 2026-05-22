import fs from "fs";
import path from "path";

type CsvRow = Record<string, string>;

type AggPlayerRow = {
  matchDate: string;
  playerEntityId: string;
  playerName: string;
  team: string;
  tier: string;
  race: string;
  matches: number;
  wins: number;
  losses: number;
  winRate: number;
};

type AggTeamRow = {
  matchDate: string;
  team: string;
  matches: number;
  wins: number;
  losses: number;
  winRate: number;
  uniquePlayers: number;
};

type AggPlayerDetailRow = {
  matchDate: string;
  playerEntityId: string;
  playerName: string;
  team: string;
  breakdownType: string;
  breakdownValue: string;
  matches: number;
  wins: number;
  losses: number;
  winRate: number;
};

export type WarehouseStatsFilters = {
  from?: string;
  to?: string;
  team?: string;
  playerEntityId?: string;
  playerName?: string;
  includeDaily?: boolean;
  includePlayerDetails?: boolean;
};

export type WarehouseStatsResult = {
  filters: Required<Pick<WarehouseStatsFilters, "from" | "to" | "team">> & {
    playerEntityId: string;
    playerName: string;
  };
  overview: {
    matches: number;
    wins: number;
    losses: number;
    winRate: number;
    uniquePlayers: number;
    dateCount: number;
  };
  daily: Array<{
    date: string;
    matches: number;
    wins: number;
    losses: number;
    winRate: number;
    uniquePlayers: number;
  }>;
  players: Array<{
    playerEntityId: string;
    playerName: string;
    team: string;
    tier: string;
    race: string;
    matches: number;
    wins: number;
    losses: number;
    winRate: number;
  }>;
  teams: Array<{
    team: string;
    matches: number;
    wins: number;
    losses: number;
    winRate: number;
    uniquePlayers: number;
  }>;
  playerDetails: null | {
    byMap: Array<{ mapName: string; matches: number; wins: number; losses: number; winRate: number }>;
    byOpponentRace: Array<{ race: string; matches: number; wins: number; losses: number; winRate: number }>;
    byOpponent: Array<{ opponentName: string; matches: number; wins: number; losses: number; winRate: number }>;
  };
};

type WarehouseOverviewCache = {
  mtimes: Record<string, number>;
  aggPlayer: AggPlayerRow[];
  aggTeam: AggTeamRow[];
};

type WarehouseDetailCache = {
  mtime: number;
  aggPlayerDetail: AggPlayerDetailRow[];
};

const ROOT = process.cwd();
const FACT_PATH = path.join(ROOT, "data", "warehouse", "fact_matches.csv");
const AGG_PLAYER_PATH = path.join(ROOT, "data", "warehouse", "agg_daily_player.csv");
const AGG_TEAM_PATH = path.join(ROOT, "data", "warehouse", "agg_daily_team.csv");
const AGG_PLAYER_DETAIL_PATH = path.join(ROOT, "data", "warehouse", "agg_player_detail_breakdowns.csv");

let overviewCache: WarehouseOverviewCache | null = null;
let detailCache: WarehouseDetailCache | null = null;

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

function readCsv(filePath: string): CsvRow[] {
  if (!fs.existsSync(filePath)) return [];
  const raw = fs.readFileSync(filePath, "utf8").replace(/^\uFEFF/, "");
  const lines = raw.split(/\r?\n/).filter((l) => l.length > 0);
  if (lines.length === 0) return [];
  const headers = parseCsvLine(lines[0]);
  return lines.slice(1).map((line) => {
    const cols = parseCsvLine(line);
    const row: CsvRow = {};
    headers.forEach((h, idx) => {
      row[h] = cols[idx] ?? "";
    });
    return row;
  });
}

function toInt(v: string): number {
  const n = Number(v);
  return Number.isFinite(n) ? Math.trunc(n) : 0;
}

function toFloat(v: string): number {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
}

function toWinRate(wins: number, matches: number): number {
  if (!matches) return 0;
  return Number(((wins / matches) * 100).toFixed(2));
}

function getFileMtime(filePath: string): number {
  return fs.existsSync(filePath) ? fs.statSync(filePath).mtimeMs : 0;
}

function loadWarehouseOverview(): WarehouseOverviewCache {
  const aggPlayerMtime = getFileMtime(AGG_PLAYER_PATH);
  const aggTeamMtime = getFileMtime(AGG_TEAM_PATH);
  const mtimes = {
    [AGG_PLAYER_PATH]: aggPlayerMtime,
    [AGG_TEAM_PATH]: aggTeamMtime,
  };

  if (
    overviewCache &&
    overviewCache.mtimes[AGG_PLAYER_PATH] === mtimes[AGG_PLAYER_PATH] &&
    overviewCache.mtimes[AGG_TEAM_PATH] === mtimes[AGG_TEAM_PATH]
  ) {
    return overviewCache;
  }

  const aggPlayer = readCsv(AGG_PLAYER_PATH).map((r) => ({
    matchDate: r.match_date,
    playerEntityId: r.player_entity_id,
    playerName: r.player_name,
    team: r.team,
    tier: r.tier,
    race: r.race,
    matches: toInt(r.matches),
    wins: toInt(r.wins),
    losses: toInt(r.losses),
    winRate: toFloat(r.win_rate),
  }));

  const aggTeam = readCsv(AGG_TEAM_PATH).map((r) => ({
    matchDate: r.match_date,
    team: r.team,
    matches: toInt(r.matches),
    wins: toInt(r.wins),
    losses: toInt(r.losses),
    winRate: toFloat(r.win_rate),
    uniquePlayers: toInt(r.unique_players),
  }));

  overviewCache = { mtimes, aggPlayer, aggTeam };
  return overviewCache;
}

function loadWarehousePlayerDetails(): AggPlayerDetailRow[] {
  const mtime = getFileMtime(AGG_PLAYER_DETAIL_PATH);
  if (detailCache && detailCache.mtime === mtime) {
    return detailCache.aggPlayerDetail;
  }

  const aggPlayerDetail = readCsv(AGG_PLAYER_DETAIL_PATH).map((r) => ({
    matchDate: r.match_date,
    playerEntityId: r.player_entity_id,
    playerName: r.player_name,
    team: r.team,
    breakdownType: r.breakdown_type,
    breakdownValue: r.breakdown_value,
    matches: toInt(r.matches),
    wins: toInt(r.wins),
    losses: toInt(r.losses),
    winRate: toFloat(r.win_rate),
  }));

  detailCache = { mtime, aggPlayerDetail };
  return aggPlayerDetail;
}

function byRange<T extends { matchDate: string }>(rows: T[], from: string, to: string): T[] {
  return rows.filter((r) => r.matchDate >= from && r.matchDate <= to);
}

function byTeam<T extends { team: string }>(rows: T[], team: string): T[] {
  if (team === "all") return rows;
  return rows.filter((r) => r.team === team);
}

function byPlayer<T extends { playerEntityId: string; playerName: string }>(
  rows: T[],
  playerEntityId: string,
  playerName: string
): T[] {
  if (playerEntityId) return rows.filter((r) => r.playerEntityId === playerEntityId);
  if (playerName) return rows.filter((r) => r.playerName === playerName);
  return rows;
}

export function getWarehouseStats(filters: WarehouseStatsFilters): WarehouseStatsResult {
  const from = filters.from || "2025-01-01";
  const to = filters.to || new Date().toISOString().slice(0, 10);
  const team = filters.team || "all";
  const playerEntityId = filters.playerEntityId || "";
  const playerName = filters.playerName || "";
  const includeDaily = filters.includeDaily !== false;
  const includePlayerDetails = filters.includePlayerDetails !== false;

  const wh = loadWarehouseOverview();

  const scopedAggPlayer = byPlayer(
    byTeam(byRange(wh.aggPlayer, from, to), team),
    playerEntityId,
    playerName
  );
  const scopedAggTeam = byTeam(byRange(wh.aggTeam, from, to), team);
  const totalMatches = scopedAggPlayer.reduce((acc, r) => acc + r.matches, 0);
  const totalWins = scopedAggPlayer.reduce((acc, r) => acc + r.wins, 0);
  const totalLosses = scopedAggPlayer.reduce((acc, r) => acc + r.losses, 0);
  const uniquePlayers = new Set(scopedAggPlayer.map((r) => r.playerEntityId)).size;
  const dateCount = new Set(scopedAggPlayer.map((r) => r.matchDate)).size;

  const daily: WarehouseStatsResult["daily"] = includeDaily
    ? (() => {
        const g = new Map<
          string,
          { matches: number; wins: number; losses: number; uniquePlayers: Set<string> }
        >();
        for (const row of scopedAggPlayer) {
          if (!g.has(row.matchDate)) {
            g.set(row.matchDate, { matches: 0, wins: 0, losses: 0, uniquePlayers: new Set() });
          }
          const d = g.get(row.matchDate)!;
          d.matches += row.matches;
          d.wins += row.wins;
          d.losses += row.losses;
          d.uniquePlayers.add(row.playerEntityId);
        }
        return [...g.entries()]
          .sort((a, b) => a[0].localeCompare(b[0]))
          .map(([date, v]) => ({
            date,
            matches: v.matches,
            wins: v.wins,
            losses: v.losses,
            winRate: toWinRate(v.wins, v.matches),
            uniquePlayers: v.uniquePlayers.size,
          }));
      })()
    : [];

  const players = (() => {
    const g = new Map<
      string,
      {
        playerEntityId: string;
        playerName: string;
        team: string;
        tier: string;
        race: string;
        matches: number;
        wins: number;
        losses: number;
      }
    >();
    for (const row of scopedAggPlayer) {
      if (!g.has(row.playerEntityId)) {
        g.set(row.playerEntityId, {
          playerEntityId: row.playerEntityId,
          playerName: row.playerName,
          team: row.team,
          tier: row.tier,
          race: row.race,
          matches: 0,
          wins: 0,
          losses: 0,
        });
      }
      const p = g.get(row.playerEntityId)!;
      p.matches += row.matches;
      p.wins += row.wins;
      p.losses += row.losses;
    }
    return [...g.values()]
      .map((p) => ({ ...p, winRate: toWinRate(p.wins, p.matches) }))
      .sort((a, b) => b.matches - a.matches || b.winRate - a.winRate);
  })();

  const teams = (() => {
    const g = new Map<string, { team: string; matches: number; wins: number; losses: number; uniquePlayers: number }>();
    for (const row of scopedAggTeam) {
      if (!g.has(row.team)) {
        g.set(row.team, { team: row.team, matches: 0, wins: 0, losses: 0, uniquePlayers: 0 });
      }
      const t = g.get(row.team)!;
      t.matches += row.matches;
      t.wins += row.wins;
      t.losses += row.losses;
      t.uniquePlayers = Math.max(t.uniquePlayers, row.uniquePlayers);
    }
    return [...g.values()]
      .map((t) => ({ ...t, winRate: toWinRate(t.wins, t.matches) }))
      .sort((a, b) => b.matches - a.matches);
  })();

  const playerDetails: WarehouseStatsResult["playerDetails"] =
    includePlayerDetails && (playerEntityId || playerName)
      ? (() => {
          const scopedDetails = byPlayer(
            byTeam(byRange(loadWarehousePlayerDetails(), from, to), team),
            playerEntityId,
            playerName
          );

          const summarize = (breakdownType: string) => {
            const grouped = new Map<string, { matches: number; wins: number; losses: number }>();
            for (const row of scopedDetails) {
              if (row.breakdownType !== breakdownType) continue;
              const value = row.breakdownValue || "Unknown";
              if (!grouped.has(value)) {
                grouped.set(value, { matches: 0, wins: 0, losses: 0 });
              }
              const bucket = grouped.get(value)!;
              bucket.matches += row.matches;
              bucket.wins += row.wins;
              bucket.losses += row.losses;
            }
            return [...grouped.entries()]
              .map(([value, s]) => ({ value, ...s, winRate: toWinRate(s.wins, s.matches) }))
              .sort((a, b) => b.matches - a.matches || b.winRate - a.winRate);
          };

          const mapRows = summarize("map").map(({ value, ...stats }) => ({ mapName: value, ...stats }));
          const raceRows = summarize("opponent_race").map(({ value, ...stats }) => ({ race: value, ...stats }));
          const oppRows = summarize("opponent")
            .map(({ value, ...stats }) => ({ opponentName: value, ...stats }))
            .slice(0, 50);

          return {
            byMap: mapRows,
            byOpponentRace: raceRows,
            byOpponent: oppRows,
          };
        })()
      : null;

  return {
    filters: { from, to, team, playerEntityId, playerName },
    overview: {
      matches: totalMatches,
      wins: totalWins,
      losses: totalLosses,
      winRate: toWinRate(totalWins, totalMatches),
      uniquePlayers,
      dateCount,
    },
    daily,
    players,
    teams,
    playerDetails,
  };
}

export function warehouseDataHealth(): {
  exists: boolean;
  rawFactExists: boolean;
  servingReady: boolean;
  paths: Record<string, string>;
} {
  const rawFactExists = fs.existsSync(FACT_PATH);
  const servingReady =
    fs.existsSync(AGG_PLAYER_PATH) &&
    fs.existsSync(AGG_TEAM_PATH) &&
    fs.existsSync(AGG_PLAYER_DETAIL_PATH);

  return {
    exists: rawFactExists && servingReady,
    rawFactExists,
    servingReady,
    paths: {
      fact: FACT_PATH,
      aggPlayer: AGG_PLAYER_PATH,
      aggTeam: AGG_TEAM_PATH,
      aggPlayerDetail: AGG_PLAYER_DETAIL_PATH,
    },
  };
}
