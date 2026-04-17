import { NextResponse } from "next/server";

import { playerService } from "@/lib/player-service";

export const runtime = "nodejs";
export const revalidate = 300;

export async function GET() {
  const players = await playerService.getCachedPlayersList();

  return NextResponse.json({
    ok: true,
    players: players.map((player) => ({
      id: player.id,
      name: player.name,
      race: player.race || "R",
    })),
  });
}
