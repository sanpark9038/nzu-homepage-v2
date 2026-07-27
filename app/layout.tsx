import type { Metadata } from "next";
import "pretendard/dist/web/variable/pretendardvariable-dynamic-subset.css";
import "./globals.css";

import { SITE_URL } from "@/lib/site-url";

export const metadata: Metadata = {
  // 상대 경로 메타(og:url·canonical)의 기준. 없으면 절대 URL이 아예 안 나간다.
  metadataBase: new URL(SITE_URL),
  robots: { index: true, follow: true },
  title: {
    default: "호사가 (HOSAGA) — 스타크래프트 대학대전",
    template: "%s | 호사가 HOSAGA",
  },
  description: "숲 스타크래프트 대학대전 호사가(HOSAGA) 공식 홈페이지. 선수 프로필, 티어표, 전적 조회를 제공합니다.",
  keywords: ["호사가", "HOSAGA", "스타크래프트", "대학대전", "SC2", "StarCraft", "호사가홈페이지"],
  openGraph: {
    title: "호사가 (HOSAGA) — 스타크래프트 대학대전",
    description: "숲 스타크래프트 대학대전 호사가(HOSAGA) 공식 홈페이지",
    siteName: "호사가 HOSAGA",
    // og:url도 canonical과 같다 — 루트에 박으면 하위 페이지 카드가 전부 홈을 가리킨다. 페이지마다 붙인다.
    type: "website",
    locale: "ko_KR",
  },
};

import { ThemeProvider } from "@/components/ThemeProvider";
import SidebarNav from "@/components/SidebarNav";
import Navbar from "@/components/Navbar";
import { ScrollToTop } from "@/components/ScrollToTop";
import { cn } from "@/lib/utils";

const SHOW_LEFT_SIDEBAR = false;

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="ko" suppressHydrationWarning>
      <body className="min-h-screen antialiased bg-background text-foreground transition-colors duration-300">
        <ThemeProvider>
          <div className="flex h-screen bg-background text-foreground transition-colors duration-300 overflow-hidden">
            {/* Left Sidebar Navigation */}
            {SHOW_LEFT_SIDEBAR ? <SidebarNav /> : null}

            {/* Main Content Area */}
            <div
              className={cn(
                "flex-1 flex flex-col min-w-0 relative transition-[padding-left] duration-300",
                SHOW_LEFT_SIDEBAR ? "pl-[var(--sidebar-width,256px)]" : "pl-0"
              )}
            >
              {/* Top Navbar */}
              <Navbar />

              {/* Scrollable Content Container */}
              <div id="main-scroll-container" className="flex-1 overflow-y-auto overflow-x-hidden relative">
                {children}
                <ScrollToTop />
              </div>
            </div>
          </div>
        </ThemeProvider>
      </body>
    </html>
  );
}
