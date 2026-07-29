// STARNEWS 송출 페이지 폰트 경계.
// 방송 오버레이는 본 사이트와 완전히 다른 타이포를 쓰므로 이 라우트에서만
// 폰트를 로드해 CSS 변수로 내려준다. 한글 글리프는 next/font가 unicode-range로 알아서 서빙.
import { Black_Han_Sans, Noto_Sans_KR } from "next/font/google";

// 헤드라인·태그·이름 — 한국 방송 자막체에 가장 가까운 굵은 디스플레이 고딕
const display = Black_Han_Sans({
  weight: "400",
  subsets: ["latin"],
  display: "swap",
  variable: "--font-news-display",
});

// 본문·표·라벨 — 중립 산세리프
const sans = Noto_Sans_KR({
  weight: ["400", "500", "700", "900"],
  subsets: ["latin"],
  display: "swap",
  variable: "--font-news-sans",
});

// OBS 브라우저 소스 전용 — 검색엔진에 노출될 이유가 없다
export const metadata = {
  robots: { index: false, follow: false },
};

export default function NewsOverlayLayout({ children }: { children: React.ReactNode }) {
  return <div className={`${display.variable} ${sans.variable}`}>{children}</div>;
}
