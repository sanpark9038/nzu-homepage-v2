import { NextRequest, NextResponse } from "next/server";

import { formatShortDate } from "@/lib/player-matchup-summary";
import { playerService } from "@/lib/player-service";

const PER_PAGE = 20;

function normalizeRace(value: string | null | undefined): "T" | "Z" | "P" {
  const raw = String(value || "").trim().toUpperCase();
  if (raw.startsWith("Z")) return "Z";
  if (raw.startsWith("P")) return "P";
  return "T";
}

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const { searchParams } = request.nextUrl;

  const filterYear = searchParams.get("year") ? Number(searchParams.get("year")) : null;
  const filterRecent90 = searchParams.get("filter") === "recent90";
  const page = Math.max(1, Number(searchParams.get("page") || "1"));

  try {
    const items = await playerService.getPlayerMatchHistoryItems(id);

    // Apply filter
    let filtered = items;

    if (filterRecent90) {
      const cutoff = new Date();
      cutoff.setDate(cutoff.getDate() - 90);
      filtered = items.filter((item) => {
        const dateStr = String(item.match_date || item.matchDate || "");
        if (!dateStr) return false;
        const d = new Date(dateStr);
        return !Number.isNaN(d.getTime()) && d >= cutoff;
      });
    } else if (filterYear !== null) {
      filtered = items.filter((item) => {
        const dateStr = String(item.match_date || item.matchDate || "");
        const match = dateStr.match(/^(\d{4})-/);
        return match ? Number(match[1]) === filterYear : false;
      });
    }

    // Sort newest first
    filtered.sort((a, b) =>
      String(b.match_date || b.matchDate || "").localeCompare(
        String(a.match_date || a.matchDate || "")
      )
    );

    // Compute aggregate stats (from ALL filtered, before pagination)
    const statsWins = filtered.filter((item) => Boolean(item.is_win ?? item.isWin)).length;
    const statsLosses = filtered.length - statsWins;
    const statsWinRate =
      filtered.length > 0
        ? `${((statsWins / filtered.length) * 100).toFixed(1)}%`
        : "0.0%";

    const raceMap = new Map<"T" | "Z" | "P", { wins: number; losses: number }>();
    for (const item of filtered) {
      const race = normalizeRace(item.opponent_race || item.opponentRace);
      if (!raceMap.has(race)) raceMap.set(race, { wins: 0, losses: 0 });
      const s = raceMap.get(race)!;
      if (Boolean(item.is_win ?? item.isWin)) s.wins++;
      else s.losses++;
    }

    const raceSummaries = (["T", "Z", "P"] as const).map((race) => {
      const s = raceMap.get(race) ?? { wins: 0, losses: 0 };
      const matches = s.wins + s.losses;
      return {
        race,
        wins: s.wins,
        losses: s.losses,
        matches,
        winRate: matches > 0 ? `${((s.wins / matches) * 100).toFixed(1)}%` : "0.0%",
        hasRecord: matches > 0,
      };
    });

    // Paginate
    const total = filtered.length;
    const totalPages = Math.max(1, Math.ceil(total / PER_PAGE));
    const clampedPage = Math.min(page, totalPages);
    const sliced = filtered.slice((clampedPage - 1) * PER_PAGE, clampedPage * PER_PAGE);

    const matches = sliced.map((item, index) => {
      const rawDate = String(item.match_date || item.matchDate || "").slice(0, 10);
      return {
        id: `hist-${clampedPage}-${index}-${rawDate}`,
        result: Boolean(item.is_win ?? item.isWin) ? ("승" as const) : ("패" as const),
        opponentName:
          String(item.opponent_name || item.opponentName || "").trim() || "알 수 없음",
        opponentRace: normalizeRace(item.opponent_race || item.opponentRace),
        mapName:
          String(item.map_name || item.mapName || "").trim() || "맵 정보 없음",
        dateText: formatShortDate(rawDate),
      };
    });

    return NextResponse.json({
      matches,
      total,
      page: clampedPage,
      totalPages,
      stats: {
        wins: statsWins,
        losses: statsLosses,
        winRate: statsWinRate,
        raceSummaries,
      },
    });
  } catch (error) {
    console.error("Error fetching player match history:", error);
    return NextResponse.json({ error: "Failed to load match history" }, { status: 500 });
  }
}
