import { NextResponse, type NextRequest } from "next/server";

import { playerService } from "@/lib/player-service";
import { buildTierPlayerPayload } from "@/lib/tier-player-payload";
import { filterTierPlayers } from "@/lib/tier-page-helpers";

export const revalidate = 60;

export async function GET(request: NextRequest) {
  const params = request.nextUrl.searchParams;
  const liveOnly = params.get("liveOnly") !== "false";
  const allPlayers = await (liveOnly ? playerService.getLivePlayers() : playerService.getCachedPlayersList());
  const players = filterTierPlayers(allPlayers, {
    liveOnly,
    race: params.get("race"),
    university: params.get("univ"),
    tier: params.get("tier"),
    search: params.get("search"),
  });

  const payload = {
    liveOnly,
    players: players.map(buildTierPlayerPayload),
    generatedAt: new Date().toISOString(),
  };

  return NextResponse.json(payload, {
    headers: {
      "Cache-Control": liveOnly
        ? "s-maxage=10, stale-while-revalidate=60"
        : "s-maxage=300, stale-while-revalidate=31536000",
    },
  });
}
