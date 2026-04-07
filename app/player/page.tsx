import { redirect } from "next/navigation";
import { PlayerPageView } from "./player-page-view";
import { playerService } from "@/lib/player-service";
import { buildPlayerHref } from "@/lib/player-route";

export const revalidate = 60;

function normalizeText(value: string) {
  return String(value || "").trim().toLowerCase();
}

export default async function PlayerIndexPage({
  searchParams,
}: {
  searchParams?: Promise<{ query?: string; id?: string }>;
}) {
  const params = searchParams ? await searchParams : undefined;
  const selectedId = String(params?.id || "").trim();
  const query = String(params?.query || "").trim();

  if (selectedId) {
    try {
      const player = await playerService.getPlayerById(selectedId);
      if (player) {
        redirect(buildPlayerHref(player));
      }
    } catch {
      // Keep rendering the shared player page view so invalid ids show the inline empty state.
    }
  }

  if (query) {
    try {
      const results = await playerService.searchPlayers(query);
      const exactMatch = results.find((player) => normalizeText(player.name) === normalizeText(query));
      if (exactMatch) {
        redirect(buildPlayerHref(exactMatch));
      }
    } catch {
      // Keep rendering the shared player page view so query search still works if lookup fails.
    }
  }

  return <PlayerPageView query={params?.query} selectedId={params?.id} />;
}
