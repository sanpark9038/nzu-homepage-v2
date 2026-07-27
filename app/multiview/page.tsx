import { MultiviewClientView } from "./MultiviewClientView";

export const metadata = {
  title: "대결뷰 — 선수 방송 동시 시청",
  description:
    "맞붙는 두 선수의 숲(SOOP) 라이브 방송을 한 화면에서 같이 보고, 그 아래에서 둘의 역대 상대전적까지 확인합니다.",
  keywords: ["스타 대학대전 대결뷰", "스타 대학리그", "스타호사가", "호사가"],
  alternates: { canonical: "/multiview" },
  openGraph: {
    title: "대결뷰 — 선수 방송 동시 시청",
    description: "두 선수의 숲(SOOP) 라이브 방송을 한 화면에서 보며 상대전적 확인",
    url: "/multiview",
    type: "website",
  },
};

export default function MultiviewPage() {
  return <MultiviewClientView />;
}
