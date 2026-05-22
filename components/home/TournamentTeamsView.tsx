import { TournamentTeamsClient } from "@/components/home/TournamentTeamsClient";
import { playerService } from "@/lib/player-service";
import { buildTournamentHomeTeamsFromConfig, loadTournamentHomeConfig } from "@/lib/tournament-home";

export async function TournamentTeamsView() {
  const [allPlayers, config] = await Promise.all([
    playerService.getCachedPlayersList(),
    loadTournamentHomeConfig(),
  ]);
  const teams = buildTournamentHomeTeamsFromConfig(allPlayers, config);

  return <TournamentTeamsClient teams={teams} />;
}
