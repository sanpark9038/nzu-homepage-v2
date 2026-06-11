import { NextResponse, type NextRequest } from "next/server";

import { playerService } from "@/lib/player-service";
import { filterTierPlayers } from "@/lib/tier-page-helpers";
import type { Player } from "@/types";

export const revalidate = 60;

function toTierPlayerPayload(player: Player) {
  return {
    id: player.id,
    name: player.name,
    nickname: player.nickname,
    race: player.race,
    gender: player.gender,
    tier: player.tier,
    university: player.university,
    is_live: player.is_live,
    broadcast_title: player.broadcast_title,
    channel_profile_image_url: player.channel_profile_image_url,
    live_thumbnail_url: player.live_thumbnail_url,
    photo_url: player.photo_url,
  };
}

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
    players: players.map(toTierPlayerPayload),
    playerNames: allPlayers.map((player) => player.name).filter(Boolean),
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
