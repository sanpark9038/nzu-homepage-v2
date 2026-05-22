import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { playerService } from "@/lib/player-service";
import { buildTournamentPredictionMatches } from "@/lib/tournament-prediction";
import {
  getPredictionMyVotes,
  getPredictionVoterId,
  loadPredictionState,
  upsertPredictionVote,
} from "@/lib/prediction-store";
import { parsePublicAuthSessionCookieValue, PUBLIC_AUTH_SESSION_COOKIE } from "@/lib/public-auth";

export const runtime = "nodejs";

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
    return NextResponse.json({
      ok: true,
      myVotes: state ? getPredictionMyVotes(state.votes, voterId) : {},
      session: serializePublicSession(session),
    });
  }

  const players = await playerService.getCachedPlayersList();
  const state = await loadPredictionState({
    voterId,
    includeVoteTotals: true,
  });
  const matches = buildTournamentPredictionMatches(players, state);
  return NextResponse.json({
    ok: true,
    matches,
    myVotes: getPredictionMyVotes(state.votes, voterId),
    session: serializePublicSession(session),
  });
}

export async function POST(req: Request) {
  const body = (await req.json().catch(() => ({}))) as {
    match_id?: string;
    picked_team_code?: string | null;
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

  const players = await playerService.getCachedPlayersList();
  const state = await loadPredictionState({
    voterId,
    includeVoteTotals: true,
  });
  const matches = buildTournamentPredictionMatches(players, state);
  return NextResponse.json({
    ok: true,
    matches,
    myVotes: getPredictionMyVotes(state.votes, voterId),
    session: serializePublicSession(session),
  });
}
