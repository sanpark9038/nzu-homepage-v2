import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: {
    default: "호사가 (HOSAGA) — 스타크래프트 대학대전",
    template: "%s | 호사가 HOSAGA",
  },
  description: "숲 스타크래프트 대학대전 호사가(HOSAGA) 공식 홈페이지. 선수 프로필, 티어표, 전적 조회를 제공합니다.",
  keywords: ["호사가", "HOSAGA", "스타크래프트", "대학대전", "SC2", "StarCraft", "호사가홈페이지"],
  openGraph: {
    title: "호사가 (HOSAGA) — 스타크래프트 대학대전",
    description: "숲 스타크래프트 대학대전 호사가(HOSAGA) 공식 홈페이지",
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
      <head>
        <meta name="naver-site-verification" content="YOUR_NAVER_CODE" />
        <link
          rel="stylesheet"
          href="https://cdn.jsdelivr.net/gh/orioncactus/pretendard@v1.3.9/dist/web/variable/pretendardvariable-dynamic-subset.min.css"
        />
      </head>
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
              <div id="main-scroll-container" className="flex-1 overflow-y-scroll overflow-x-hidden relative">
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
