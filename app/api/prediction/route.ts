import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { playerService } from "@/lib/player-service";
import { buildTournamentPredictionMatches } from "@/lib/tournament-prediction";
import { buildTournamentHomeTeamsFromStore } from "@/lib/tournament-home";
import {
  getPredictionMyVotes,
  getPredictionVoterId,
  loadPredictionState,
  upsertPredictionVote,
} from "@/lib/prediction-store";
import { parsePublicAuthSessionCookieValue, PUBLIC_AUTH_SESSION_COOKIE } from "@/lib/public-auth";
import { getBetPools, getMyBalance, getMyBets, moveBetTeam, placeBet } from "@/lib/prediction-bets";

export const runtime = "nodejs";

const BET_ERROR_CODES = new Set([
  "bet_invalid_stake",
  "bet_invalid_team",
  "bet_invalid_request",
  "bet_exists",
  "points_insufficient",
]);

/** 베팅 관련 3종 세트 — 투표 payload와 독립이라 실패해도 투표 응답은 나가야 한다. */
async function loadBetState(voterId: string) {
  const [betPools, myBets, myBalance] = await Promise.all([
    getBetPools().catch(() => []),
    getMyBets(voterId).catch(() => ({})),
    getMyBalance(voterId).catch(() => 0),
  ]);
  return { betPools, myBets, myBalance };
}

async function getPublicSession() {
  const cookieStore = await cookies();
  return parsePublicAuthSessionCookieValue(cookieStore.get(PUBLIC_AUTH_SESSION_COOKIE)?.value);
}

function serializePublicSession(session: Awaited<ReturnType<typeof getPublicSession>>) {
  return session
    ? {
        provider: session.provider,
        displayName: session.displayName,
        avatarUrl: session.avatarUrl,
      }
    : null;
}

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const session = await getPublicSession();
  const voterId = session ? getPredictionVoterId(session) : "";
  const scope = searchParams.get("scope");

  if (scope === "viewer") {
    const state = voterId
      ? await loadPredictionState({
          voterId,
        })
      : null;
    const bets = await loadBetState(voterId);
    return NextResponse.json({
      ok: true,
      myVotes: state ? getPredictionMyVotes(state.votes, voterId) : {},
      betPools: bets.betPools,
      myBets: bets.myBets,
      myBalance: bets.myBalance,
      session: serializePublicSession(session),
    });
  }

  const players = await playerService.getCachedPlayersList();
  const [state, tournamentTeams, bets] = await Promise.all([
    loadPredictionState({
      voterId,
      includeVoteTotals: true,
    }),
    buildTournamentHomeTeamsFromStore(players),
    loadBetState(voterId),
  ]);
  const matches = buildTournamentPredictionMatches(players, state, { tournamentTeams });
  return NextResponse.json({
    ok: true,
    matches,
    myVotes: getPredictionMyVotes(state.votes, voterId),
    betPools: bets.betPools,
    myBets: bets.myBets,
    myBalance: bets.myBalance,
    session: serializePublicSession(session),
  });
}

export async function POST(req: Request) {
  const body = (await req.json().catch(() => ({}))) as {
    match_id?: string;
    picked_team_code?: string | null;
    stake?: number;
  };

  const session = await getPublicSession();
  if (!session) {
    return NextResponse.json(
      { ok: false, message: "prediction_login_required" },
      { status: 401 }
    );
  }

  const voterId = getPredictionVoterId(session);
  const matchId = String(body.match_id || "").trim();
  if (!matchId) {
    return NextResponse.json(
      { ok: false, message: "match_id is required" },
      { status: 400 }
    );
  }

  try {
    await upsertPredictionVote({
      voterId,
      matchId,
      voterSession: session,
      pickedTeamCode:
        Object.prototype.hasOwnProperty.call(body, "picked_team_code") ? body.picked_team_code ?? null : undefined,
      pickedPlayerId: null,
    });
  } catch (error) {
    return NextResponse.json(
      {
        ok: false,
        message: error instanceof Error ? error.message : "failed to save vote",
      },
      { status: 400 }
    );
  }

  // 투표는 이미 저장됐다. 베팅 실패는 투표까지 되돌리지 않고 betError로만 알린다.
  const pickedTeamCode = String(body.picked_team_code || "").trim();
  const stake = Number(body.stake || 0);
  let betError = "";

  try {
    if (stake > 0) {
      await placeBet({
        voterId,
        displayName: session.displayName || "",
        matchId,
        teamCode: pickedTeamCode,
        stake,
      });
    } else {
      await moveBetTeam({ voterId, matchId, teamCode: pickedTeamCode });
    }
  } catch (error) {
    const code = error instanceof Error ? error.message : "bet_failed";
    betError = BET_ERROR_CODES.has(code) ? code : "bet_failed";
  }

  const players = await playerService.getCachedPlayersList();
  const [state, tournamentTeams, bets] = await Promise.all([
    loadPredictionState({
      voterId,
      includeVoteTotals: true,
    }),
    buildTournamentHomeTeamsFromStore(players),
    loadBetState(voterId),
  ]);
  const matches = buildTournamentPredictionMatches(players, state, { tournamentTeams });
  return NextResponse.json({
    ok: true,
    matches,
    myVotes: getPredictionMyVotes(state.votes, voterId),
    betPools: bets.betPools,
    myBets: bets.myBets,
    myBalance: bets.myBalance,
    betError,
    session: serializePublicSession(session),
  });
}
