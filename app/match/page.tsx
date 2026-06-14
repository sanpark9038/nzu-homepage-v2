import {
  mapPlayersToMatchPageSummaries,
  packMatchPagePlayerSummaries,
  type PackedMatchPagePlayerSummary,
} from "@/lib/matchup-helpers";
import { playerService } from "@/lib/player-service";

import MatchPageClient from "./MatchPageClient";

export const revalidate = 300;

export default async function MatchPage() {
  let packedInitialPlayers: PackedMatchPagePlayerSummary[] = [];
  let initialPlayersLoadFailed = false;

  try {
    const players = await playerService.getCachedPlayersList();
    const matchPagePlayers = mapPlayersToMatchPageSummaries(players);
    packedInitialPlayers = packMatchPagePlayerSummaries(matchPagePlayers);
  } catch {
    initialPlayersLoadFailed = true;
    packedInitialPlayers = [];
  }

  return <MatchPageClient packedInitialPlayers={packedInitialPlayers} initialPlayersLoadFailed={initialPlayersLoadFailed} />;
}
