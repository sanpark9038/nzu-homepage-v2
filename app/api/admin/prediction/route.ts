import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { ADMIN_SESSION_COOKIE, assertValidAdminSession } from "@/lib/admin-auth";
import {
  deletePredictionMatch,
  deletePredictionMatchWithVotes,
  loadPredictionState,
  savePredictionMatches,
} from "@/lib/prediction-store";

export const runtime = "nodejs";
const FORCE_DELETE_CONFIRMATION = "투표 포함 삭제";

export async function GET() {
  try {
    const cookieStore = await cookies();
    assertValidAdminSession(cookieStore.get(ADMIN_SESSION_COOKIE)?.value);
    const state = await loadPredictionState();
    return NextResponse.json({ ok: true, matches: state.matches, votes: state.votes, source: state.source });
  } catch (error) {
    const status = error instanceof Error && error.message === "unauthorized" ? 401 : 500;
    return NextResponse.json({ ok: false, message: status === 401 ? "unauthorized" : "failed to load matches" }, { status });
  }
}

export async function POST(req: Request) {
  try {
    const cookieStore = await cookies();
    assertValidAdminSession(cookieStore.get(ADMIN_SESSION_COOKIE)?.value);
    const body = await req.json();
    const { matches } = body;

    if (!Array.isArray(matches)) {
      return NextResponse.json({ ok: false, message: "matches must be an array" }, { status: 400 });
    }

    await savePredictionMatches(matches);
    const state = await loadPredictionState();
    return NextResponse.json({ ok: true, matches: state.matches, votes: state.votes, source: state.source });
  } catch (error) {
    const message = error instanceof Error ? error.message : "failed to update matches";
    const status =
      message === "unauthorized"
        ? 401
        : message === "duplicate_prediction_player" || message === "prediction_supabase_required"
          ? 400
          : 500;
    return NextResponse.json(
      { ok: false, message: status === 401 ? "unauthorized" : message },
      { status }
    );
  }
}

export async function DELETE(req: Request) {
  try {
    const cookieStore = await cookies();
    assertValidAdminSession(cookieStore.get(ADMIN_SESSION_COOKIE)?.value);
    const body = (await req.json().catch(() => ({}))) as {
      match_id?: string;
      delete_votes?: boolean;
      confirm_text?: string;
    };
    const matchId = String(body.match_id || "").trim();

    if (!matchId) {
      return NextResponse.json({ ok: false, message: "match_id is required" }, { status: 400 });
    }

    if (body.delete_votes === true) {
      if (String(body.confirm_text || "").trim() !== FORCE_DELETE_CONFIRMATION) {
        return NextResponse.json(
          { ok: false, message: "prediction_force_delete_confirmation_required" },
          { status: 400 }
        );
      }
      await deletePredictionMatchWithVotes(matchId);
    } else {
      await deletePredictionMatch(matchId);
    }
    const state = await loadPredictionState();
    return NextResponse.json({ ok: true, matches: state.matches, votes: state.votes, source: state.source });
  } catch (error) {
    const message = error instanceof Error ? error.message : "failed to delete match";
    const status =
      message === "unauthorized"
        ? 401
        : message === "prediction_match_not_found" ||
            message === "prediction_delete_has_votes" ||
            message === "prediction_force_delete_confirmation_required" ||
            message === "prediction_supabase_required"
          ? 400
          : 500;
    return NextResponse.json(
      { ok: false, message: status === 401 ? "unauthorized" : message },
      { status }
    );
  }
}
