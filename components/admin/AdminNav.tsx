"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const ADMIN_LINKS = [
  { href: "/admin/ops", label: "운영 현황" },
  { href: "/admin/tournament", label: "토너먼트 관리" },
  { href: "/admin/roster", label: "로스터 교정" },
  { href: "/admin/universities", label: "대학 관리" },
  { href: "/admin/hero-media", label: "히어로 미디어" },
  { href: "/admin/prediction", label: "예측 경기 설정" },
  { href: "/admin/rankings", label: "순위 관리" },
  { href: "/", label: "홈페이지" },
];

export function AdminNav() {
  const pathname = usePathname();

  return (
    <nav className="mb-8 flex w-fit flex-wrap items-center gap-2 rounded-2xl border border-white/10 bg-white/5 p-1">
      {ADMIN_LINKS.map((link) => {
        const isActive =
          pathname === link.href ||
          (link.href !== "/" && pathname.startsWith(`${link.href}/`));

        return (
          <Link
            key={link.href}
            href={link.href}
            className={`rounded-xl px-4 py-2 text-xs font-black uppercase tracking-widest transition-all ${
              isActive
                ? "bg-nzu-green text-black shadow-[0_0_15px_rgba(30,215,96,0.3)]"
                : "text-white/40 hover:bg-white/5 hover:text-white"
            }`}
          >
            {link.label}
          </Link>
        );
      })}
    </nav>
  );
}
