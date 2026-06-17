import { redirect } from "next/navigation";
import { unstable_noStore as noStore } from "next/cache";

import { playerService } from "@/lib/player-service";
import { buildPlayerHref } from "@/lib/player-route";

import { PlayerPageView } from "../player-page-view";

export const revalidate = 0;
export const dynamic = "force-dynamic";

export default async function PlayerQueryPage({
  searchParams,
}: {
  searchParams?: Promise<{ query?: string; id?: string }>;
}) {
  noStore();
  const params = searchParams ? await searchParams : undefined;
  const selectedId = String(params?.id || "").trim();

  if (selectedId) {
    let redirectHref: string | null = null;
    try {
      const player = await playerService.getPlayerById(selectedId);
      if (player) {
        redirectHref = buildPlayerHref(player);
      }
    } catch {
      // Keep rendering the shared player page view so invalid ids show the inline empty state.
    }
    if (redirectHref) redirect(redirectHref);
  }

  return <PlayerPageView query={params?.query} selectedId={params?.id} />;
}
