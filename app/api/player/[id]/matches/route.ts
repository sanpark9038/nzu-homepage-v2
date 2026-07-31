import { NextRequest, NextResponse } from "next/server";

import { classifyMatchNote, getDisplayNote } from "@/lib/match-note";
import { formatShortDate } from "@/lib/player-matchup-summary";
import { playerService } from "@/lib/player-service";

const PER_PAGE = 20;
const CATEGORY_PARAMS = ["important", "mini", "uni", "tourney"] as const;
type CategoryParam = (typeof CATEGORY_PARAMS)[number];

type MatchItem = Awaited<ReturnType<typeof playerService.getPlayerMatchHistoryItems>>[number];

function normalizeRace(value: string | null | undefined): "T" | "Z" | "P" {
  const raw = String(value || "").trim().toUpperCase();
  if (raw.startsWith("Z")) return "Z";
  if (raw.startsWith("P")) return "P";
  return "T";
}

function isWin(item: MatchItem) {
  return Boolean(item.is_win ?? item.isWin);
}

function winRateText(wins: number, matches: number) {
  return matches > 0 ? `${((wins / matches) * 100).toFixed(1)}%` : "0.0%";
}

/** excludeMini가 켜지면 "중요"의 정의에서 미니대전을 뺀다(uni + tourney만). */
function isImportant(item: MatchItem, excludeMini: boolean) {
  const category = classifyMatchNote(item.note);
  if (category === null) return false;
  return excludeMini ? category !== "mini" : true;
}

/** 전체 전적·중요경기 전적이 같은 shape을 쓰도록 공유하는 종족별 집계 */
function buildRaceSummaries(list: MatchItem[]) {
  const raceMap = new Map<"T" | "Z" | "P", { wins: number; losses: number }>();
  for (const item of list) {
    const race = normalizeRace(item.opponent_race || item.opponentRace);
    if (!raceMap.has(race)) raceMap.set(race, { wins: 0, losses: 0 });
    const s = raceMap.get(race)!;
    if (isWin(item)) s.wins++;
    else s.losses++;
  }

  return (["T", "Z", "P"] as const).map((race) => {
    const s = raceMap.get(race) ?? { wins: 0, losses: 0 };
    const matches = s.wins + s.losses;
    return {
      race,
      wins: s.wins,
      losses: s.losses,
      matches,
      winRate: winRateText(s.wins, matches),
      hasRecord: matches > 0,
    };
  });
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
  const categoryParam = CATEGORY_PARAMS.includes(searchParams.get("category") as CategoryParam)
    ? (searchParams.get("category") as CategoryParam)
    : null;
  const excludeMini = searchParams.get("excludeMini") === "1";

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
    const statsWins = filtered.filter(isWin).length;
    const statsLosses = filtered.length - statsWins;
    const statsWinRate = winRateText(statsWins, filtered.length);

    const raceSummaries = buildRaceSummaries(filtered);

    // 중요경기 전적은 목록 필터(category)와 무관하게 항상 filtered 전체에서 뽑는다.
    const importantItems = filtered.filter((item) => isImportant(item, excludeMini));
    const importantWins = importantItems.filter(isWin).length;
    // filtered는 최신순 → 앞에서 10개 취한 뒤 뒤집어 오래된→최신 순으로 내보낸다
    const formItems = importantItems.slice(0, 10).reverse();
    const formDateText = (item: MatchItem | undefined) =>
      item ? formatShortDate(String(item.match_date || item.matchDate || "").slice(0, 10)) : null;

    // 대회 분류 필터는 통계 산출 이후에 — 위쪽 승패 요약·종족별 승률은 기간에만 반응하고,
    // 아래 경기 목록만 종류로 걸러진다. 전체 승률과 중요경기 승률을 대조할 수 있어야 하므로 덮어쓰지 않는다.
    const visible = categoryParam
      ? filtered.filter((item) =>
          // 분류를 명시적으로 고른 경우(mini/uni/tourney)는 excludeMini와 무관하게 그대로 보여준다.
          categoryParam === "important"
            ? isImportant(item, excludeMini)
            : classifyMatchNote(item.note) === categoryParam
        )
      : filtered;

    // Paginate
    const total = visible.length;
    const totalPages = Math.max(1, Math.ceil(total / PER_PAGE));
    const clampedPage = Math.min(page, totalPages);
    const sliced = visible.slice((clampedPage - 1) * PER_PAGE, clampedPage * PER_PAGE);

    const matches = sliced.map((item, index) => {
      const rawDate = String(item.match_date || item.matchDate || "").slice(0, 10);
      return {
        id: `hist-${clampedPage}-${index}-${rawDate}`,
        result: isWin(item) ? ("승" as const) : ("패" as const),
        opponentName:
          String(item.opponent_name || item.opponentName || "").trim() || "알 수 없음",
        opponentRace: normalizeRace(item.opponent_race || item.opponentRace),
        mapName:
          String(item.map_name || item.mapName || "").trim() || "맵 정보 없음",
        dateText: formatShortDate(rawDate),
        note: getDisplayNote(item.note),
        category: classifyMatchNote(item.note),
      };
    });

    return NextResponse.json(
      {
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
        importantStats: {
          wins: importantWins,
          losses: importantItems.length - importantWins,
          winRate: winRateText(importantWins, importantItems.length),
          raceSummaries: buildRaceSummaries(importantItems),
          form: formItems.map((item) => (isWin(item) ? ("승" as const) : ("패" as const))),
          formFromDateText: formDateText(formItems[0]),
          formToDateText: formDateText(formItems[formItems.length - 1]),
        },
      },
      {
        headers: {
          "Cache-Control": "public, s-maxage=60, stale-while-revalidate=300",
        },
      }
    );
  } catch (error) {
    console.error("Error fetching player match history:", error);
    return NextResponse.json({ error: "Failed to load match history" }, { status: 500 });
  }
}
