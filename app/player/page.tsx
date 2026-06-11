import { PlayerPageView } from "./player-page-view";

export const revalidate = 300;

export default async function PlayerIndexPage() {
  return <PlayerPageView />;
}
