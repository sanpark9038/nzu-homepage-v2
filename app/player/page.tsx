import { PlayerPageView } from "./player-page-view";

export const revalidate = 300;

export const metadata = {
  title: "스타 대학대전 선수 전적",
  description:
    "선수 이름으로 검색하면 통산 전적과 최근 흐름, 종족전 성적, 주요 맵 지표를 한 번에 볼 수 있습니다.",
  keywords: ["스타 대학대전 선수", "스타 대학대전 전적", "스타 대학리그 선수", "스타호사가"],
  alternates: { canonical: "/player" },
  openGraph: {
    title: "스타 대학대전 선수 전적",
    description: "선수 이름으로 통산 전적과 최근 흐름, 종족전·맵 지표를 검색",
    url: "/player",
    type: "website",
  },
};

export default async function PlayerIndexPage() {
  return <PlayerPageView />;
}
