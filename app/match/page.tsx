import {
  mapPlayersToMatchPageSummaries,
  packMatchPagePlayerSummaries,
  type PackedMatchPagePlayerSummary,
} from "@/lib/matchup-helpers";
import { playerService } from "@/lib/player-service";

import MatchPageClient from "./MatchPageClient";

export const revalidate = 300;

export const metadata = {
  title: "스타 대학대전 상대전적",
  description:
    "두 팀 선수를 나란히 세워 맞대결 상대전적을 봅니다. 통산 기록과 최근 3개월 흐름을 비교해 대진을 짜볼 수 있습니다.",
  keywords: ["스타 대학대전 상대전적", "스타 대학대전 전적", "스타 대학리그", "스타호사가"],
  alternates: { canonical: "/match" },
  openGraph: {
    title: "스타 대학대전 상대전적",
    description: "두 팀 선수의 맞대결 전적을 통산·최근 3개월로 비교하며 대진 편성",
    url: "/match",
    type: "website",
  },
};

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
