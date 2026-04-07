import { redirect } from "next/navigation";
import { PlayerPageView } from "../player-page-view";
import { parsePlayerSlug } from "@/lib/player-route";
import { buildPlayerHref } from "@/lib/player-route";
import { playerService } from "@/lib/player-service";

export const revalidate = 60;

export default async function PlayerProfileRedirectPage({
  params,
}: {
  params: { id: string };
}) {
  const { id } = await params;
  const currentPath = `/player/${encodeURIComponent(id)}`;
  const parsed = parsePlayerSlug(id);

  if (parsed.selectedId) {
    try {
      const player = await playerService.getPlayerById(parsed.selectedId);
      if (player) {
        const canonicalHref = buildPlayerHref(player);
        if (canonicalHref !== currentPath) {
          redirect(canonicalHref);
        }
      }
    } catch {
      // Fall through to the shared player page view for invalid ids.
    }
  }

  if (parsed.selectedIdPrefix) {
    try {
      const player = await playerService.getPlayerByIdPrefix(parsed.selectedIdPrefix);
      if (player) {
        const canonicalHref = buildPlayerHref(player);
        if (canonicalHref !== currentPath) {
          redirect(canonicalHref);
        }
      }
    } catch {
      // Fall through to the shared player page view if prefix lookup fails.
    }
  }

  return (
    <PlayerPageView
      query={parsed.query}
      selectedId={parsed.selectedId}
      selectedIdPrefix={parsed.selectedIdPrefix}
    />
  );
}
