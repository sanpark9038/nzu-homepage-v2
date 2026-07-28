import Link from "next/link";

/** 중만컵 하위 메뉴. 여기에 한 줄 추가하면 두 페이지 모두에 탭이 늘어난다. */
export const JUNGMAN_TABS = [
  { href: "/jungman", label: "투표" },
  { href: "/jungman/standings", label: "순위" },
] as const;

function tabClassName(active: boolean) {
  return active
    ? "shrink-0 whitespace-nowrap rounded-lg bg-nzu-green/10 px-3 py-1.5 text-nzu-green transition hover:bg-nzu-green/15 md:py-2"
    : "shrink-0 whitespace-nowrap rounded-lg bg-white/[0.03] px-3 py-1.5 text-white/42 transition hover:bg-white/[0.06] hover:text-white/72 md:py-2";
}

export default function JungmanSubNav({ activeHref }: { activeHref: string }) {
  return (
    <nav className="mb-3 flex items-center gap-2 overflow-x-auto text-sm font-semibold">
      {JUNGMAN_TABS.map((tab) => {
        const active = tab.href === activeHref;
        return (
          <Link
            key={tab.href}
            href={tab.href}
            prefetch={false}
            aria-current={active ? "page" : undefined}
            className={tabClassName(active)}
          >
            {tab.label}
          </Link>
        );
      })}
    </nav>
  );
}
