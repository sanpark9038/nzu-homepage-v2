import { NextResponse } from "next/server";
import { playerService } from "@/lib/player-service";
import {
  buildTournamentPredictionMatches,
  upsertPredictionVote,
} from "@/lib/tournament-prediction";

export const runtime = "nodejs";

export async function GET() {
  const players = await playerService.getAllPlayers();
  const matches = buildTournamentPredictionMatches(players);
  return NextResponse.json({ ok: true, matches });
}

export async function POST(req: Request) {
  const body = (await req.json().catch(() => ({}))) as {
    voter_id?: string;
    match_id?: string;
    picked_team_code?: string | null;
    picked_player_id?: string | null;
  };

  const voterId = String(body.voter_id || "").trim();
  const matchId = String(body.match_id || "").trim();
  if (!voterId || !matchId) {
    return NextResponse.json(
      { ok: false, message: "voter_id and match_id are required" },
      { status: 400 }
    );
  }

  try {
    upsertPredictionVote({
      voterId,
      matchId,
      pickedTeamCode:
        Object.prototype.hasOwnProperty.call(body, "picked_team_code") ? body.picked_team_code ?? null : undefined,
      pickedPlayerId:
        Object.prototype.hasOwnProperty.call(body, "picked_player_id") ? body.picked_player_id ?? null : undefined,
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

  const players = await playerService.getAllPlayers();
  const matches = buildTournamentPredictionMatches(players);
  return NextResponse.json({ ok: true, matches });
}
