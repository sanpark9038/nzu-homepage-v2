export type NavbarLinkItem = {
  type: "link";
  href: string;
  label: string;
};

export type NavbarUtilityItem = {
  type: "utility";
  key: "search" | "messages" | "notifications";
  label: string;
};

export type NavbarItem = NavbarLinkItem | NavbarUtilityItem;

export const visibleNavbarLinks: NavbarLinkItem[] = [
  { type: "link", href: "/", label: "홈" },
  { type: "link", href: "/board", label: "게시판" },
  { type: "link", href: "/schedule", label: "일정" },
  { type: "link", href: "/prediction", label: "승부예측" },
  { type: "link", href: "/tier", label: "티어표" },
  { type: "link", href: "/player", label: "선수" },
  { type: "link", href: "/match", label: "상대전적" },
  { type: "link", href: "/entry", label: "엔트리" },
  { type: "link", href: "/multiview", label: "대결뷰" },
  { type: "link", href: "/jungman", label: "K-중만컵" },
  // 스트리머·매니저용 방송 오버레이 도구 — 게이트(/overlay/admin)가 로그인·권한별 안내를 담당
  { type: "link", href: "/overlay/admin", label: "스코어보드" },
];

export const hiddenNavbarLinks: NavbarLinkItem[] = [
  { type: "link", href: "/rankings", label: "팀 및 선수 순위" },
];

/**
 * 전역 헤더(내비·상단 버튼)를 걷어내는 라우트.
 * 방송 오버레이와 외부 사이트 iframe 임베드는 화면 자체가 결과물이라 사이트 크롬이 끼면 안 된다.
 */
const CHROMELESS_ROUTES = ["/overlay/scoreboard", "/overlay/entry", "/overlay/news", "/jungman/embed"];

export function isChromelessRoute(pathname: string | null | undefined) {
  return CHROMELESS_ROUTES.some((route) => pathname?.startsWith(route));
}

export const hiddenNavbarUtilities: NavbarUtilityItem[] = [
  { type: "utility", key: "search", label: "통합검색" },
  { type: "utility", key: "messages", label: "메시지 알림" },
  { type: "utility", key: "notifications", label: "운영 알림" },
];
