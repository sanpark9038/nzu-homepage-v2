import { TierPageView } from "./TierPageView";

export const revalidate = 60;

export const metadata = {
  title: "스타 대학대전 티어표",
  description:
    "대학대전 출전 선수의 티어를 한 장으로 봅니다. 종족과 대학, 티어로 걸러보고 지금 방송 중인 선수만 따로 볼 수 있습니다.",
  keywords: ["스타 대학대전 티어표", "스타 대학리그 티어", "숲 스타크래프트 대학대전", "스타호사가"],
  alternates: { canonical: "/tier" },
  openGraph: {
    title: "스타 대학대전 티어표",
    description: "출전 선수 티어를 종족·대학·티어로 걸러 한 장에서 확인",
    url: "/tier",
    type: "website",
  },
};

export default async function TierPage() {
  return <TierPageView />;
}
