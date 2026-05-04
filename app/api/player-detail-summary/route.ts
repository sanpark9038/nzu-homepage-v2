import { NextRequest, NextResponse } from "next/server";

import { getCachedPlayerDetailSummaryById } from "@/lib/player-detail-summary";

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const playerId = String(searchParams.get("id") || "").trim();

  if (!playerId) {
    return NextResponse.json({ error: "Player id is required." }, { status: 400 });
  }

  try {
    const summary = await getCachedPlayerDetailSummaryById(playerId);
    return NextResponse.json(summary);
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Internal Server Error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
