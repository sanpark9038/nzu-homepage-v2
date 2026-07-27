import type { MetadataRoute } from "next";

import { hiddenNavbarLinks, visibleNavbarLinks } from "@/lib/navigation-config";
import { SITE_URL } from "@/lib/site-url";

// 자주 바뀌는 목록만 daily — 나머지는 주 단위로 충분하다
const DAILY = new Set(["/", "/board", "/schedule", "/prediction", "/jungman"]);

/**
 * 공개 라우트 목록. 원본은 내비게이션 설정 하나다 — 메뉴가 늘면 사이트맵도 같이 는다.
 * 동적 상세(/player/[id], /board/[id])는 넣지 않는다. 수천 개를 흘리는 대신 목록 페이지가 대표한다.
 */
export default function sitemap(): MetadataRoute.Sitemap {
  const lastModified = new Date();

  return [...visibleNavbarLinks, ...hiddenNavbarLinks]
    // 오버레이는 방송 도구다 — 검색 결과에 있을 이유가 없다
    .filter((link) => !link.href.startsWith("/overlay"))
    .map((link) => ({
      url: `${SITE_URL}${link.href === "/" ? "" : link.href}`,
      lastModified,
      changeFrequency: (DAILY.has(link.href) ? "daily" : "weekly") as "daily" | "weekly",
      priority: link.href === "/" ? 1 : 0.7,
    }));
}
