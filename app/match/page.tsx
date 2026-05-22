import { mapPlayersToMatchupSummaries, type MatchupPlayerSummary } from "@/lib/matchup-helpers";
import { playerService } from "@/lib/player-service";

import MatchPageClient from "./MatchPageClient";

export const revalidate = 300;

export default async function MatchPage() {
  let initialPlayers: MatchupPlayerSummary[] = [];
  let initialPlayersLoadFailed = false;

  try {
    const players = await playerService.getCachedPlayersList();
    initialPlayers = mapPlayersToMatchupSummaries(players);
  } catch {
    initialPlayersLoadFailed = true;
    initialPlayers = [];
  }

  return <MatchPageClient initialPlayers={initialPlayers} initialPlayersLoadFailed={initialPlayersLoadFailed} />;
}
