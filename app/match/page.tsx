import { mapPlayersToMatchPageSummaries, type MatchPagePlayerSummary } from "@/lib/matchup-helpers";
import { playerService } from "@/lib/player-service";

import MatchPageClient from "./MatchPageClient";

export const revalidate = 300;

export default async function MatchPage() {
  let initialPlayers: MatchPagePlayerSummary[] = [];
  let initialPlayersLoadFailed = false;

  try {
    const players = await playerService.getCachedPlayersList();
    initialPlayers = mapPlayersToMatchPageSummaries(players);
  } catch {
    initialPlayersLoadFailed = true;
    initialPlayers = [];
  }

  return <MatchPageClient initialPlayers={initialPlayers} initialPlayersLoadFailed={initialPlayersLoadFailed} />;
}
