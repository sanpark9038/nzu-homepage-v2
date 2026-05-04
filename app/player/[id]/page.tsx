import { redirect } from "next/navigation";
import { unstable_noStore as noStore } from "next/cache";
import { PlayerPageView } from "../player-page-view";
import { parsePlayerSlug } from "@/lib/player-route";
import { buildPlayerHref } from "@/lib/player-route";
import { playerService, type Player } from "@/lib/player-service";

export const revalidate = 0;
export const dynamic = "force-dynamic";

export default async function PlayerProfileRedirectPage({
  params,
}: {
  params: { id: string };
}) {
  noStore();
  const { id } = await params;
  const currentPath = `/player/${encodeURIComponent(id)}`;
  const parsed = parsePlayerSlug(id);
  let initialPlayerForView: Player | null = null;

  if (parsed.selectedId) {
    try {
      const player = await playerService.getPlayerById(parsed.selectedId);
      if (player) {
        initialPlayerForView = player;
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
        initialPlayerForView = player;
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
      initialPlayer={initialPlayerForView}
    />
  );
}
