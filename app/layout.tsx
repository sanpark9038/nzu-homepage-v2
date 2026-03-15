import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: {
    default: "늪지대 (NZU) — 스타크래프트 대학대전",
    template: "%s | 늪지대 NZU",
  },
  description: "숲 스타크래프트 대학대전 늪지대(NZU) 공식 홈페이지. 선수 프로필, 티어표, 전적 조회를 제공합니다.",
  keywords: ["늪지대", "NZU", "스타크래프트", "대학대전", "SC2", "StarCraft", "늪지대홈페이지"],
  openGraph: {
    title: "늪지대 (NZU) — 스타크래프트 대학대전",
    description: "숲 스타크래프트 대학대전 늪지대(NZU) 공식 홈페이지",
    type: "website",
    locale: "ko_KR",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="ko" className="dark">
      <head>
        <meta name="naver-site-verification" content="YOUR_NAVER_CODE" />
        <link
          rel="stylesheet"
          href="https://cdn.jsdelivr.net/gh/orioncactus/pretendard@v1.3.9/dist/web/variable/pretendardvariable-dynamic-subset.min.css"
        />
      </head>
      <body className="min-h-screen antialiased">
        {children}
      </body>
    </html>
  );
}
