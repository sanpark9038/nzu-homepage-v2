"use client";

// STARNEWS 송출 페이지 — OBS 브라우저 소스에 1920×1080으로 띄운다.
// ?key=<view_token> 으로 news 행을 0.5초 폴링. 위젯이 전부 꺼져 있으면 완전 투명.
import { Suspense } from "react";
import { useSearchParams } from "next/navigation";
import { useOverlayLive } from "@/lib/use-overlay-live";
import { normalizeNewsState } from "@/components/starnews/news-types";
import { Banner, Card, Fullscreen, LowerThird, Ticker } from "@/components/starnews/news-widgets";

function NewsInner() {
  const searchParams = useSearchParams();
  const overlayKey = searchParams.get("key") ?? "";
  const { state } = useOverlayLive(overlayKey);

  if (!overlayKey) return null;

  // useOverlayLive는 OverlayState 타입으로 반환하지만 news 행의 data는 { news: ... }다.
  // 폴링이 스프레드로 병합하므로 런타임에는 살아 있다 — 꺼내서 정규화.
  const news = normalizeNewsState((state as unknown as { news?: unknown }).news);

  // 전면 화면이 뜨면 다른 위젯은 그 아래 가려질 뿐이라 아예 렌더하지 않는다. 티커만 위에 유지.
  const full = news.fullscreen.visible;

  return (
    <>
      <style>{`@keyframes newsMarquee { from { transform: translateX(0); } to { transform: translateX(-50%); } }`}</style>

      <div style={{
        position: "fixed", inset: 0,
        width: "1920px", height: "1080px",
        background: "transparent",
        pointerEvents: "none",
        overflow: "hidden",
        color: "#EAEAEA",
      }}>
        {full && <Fullscreen table={news.fullscreen.table} />}

        {!full && news.banner.visible && <Banner banner={news.banner} />}
        {!full && news.lowerThird.visible && <LowerThird lower={news.lowerThird} />}
        {!full && news.card.visible && <Card table={news.card.table} />}

        {/* 티커는 전면 화면 위에 — 속보 흐름은 전면 자료 중에도 끊기지 않아야 함 */}
        {news.ticker.visible && (
          <div style={{ position: "absolute", inset: 0, zIndex: 10 }}>
            <Ticker ticker={news.ticker} />
          </div>
        )}
      </div>
    </>
  );
}

// useSearchParams()는 Suspense 경계 필요 (빌드 프리렌더 CSR bailout)
export default function NewsOverlayPage() {
  return <Suspense fallback={null}><NewsInner /></Suspense>;
}
