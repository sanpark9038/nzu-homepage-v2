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
  { type: "link", href: "/prediction", label: "승부예측" },
  { type: "link", href: "/tier", label: "티어표" },
  { type: "link", href: "/player", label: "선수" },
  { type: "link", href: "/match", label: "상대전적" },
  { type: "link", href: "/entry", label: "엔트리" },
  { type: "link", href: "/teams", label: "참가팀" },
  { type: "link", href: "/rankings", label: "팀 및 선수 순위" },
];

export const hiddenNavbarLinks: NavbarLinkItem[] = [
  { type: "link", href: "/schedule", label: "대회일정" },
];

export const hiddenNavbarUtilities: NavbarUtilityItem[] = [
  { type: "utility", key: "search", label: "통합검색" },
  { type: "utility", key: "messages", label: "메시지 알림" },
  { type: "utility", key: "notifications", label: "운영 알림" },
];
