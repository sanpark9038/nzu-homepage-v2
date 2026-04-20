"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const ADMIN_LINKS = [
  { href: "/admin/ops", label: "운영 대시보드" },
  { href: "/admin/tournament", label: "대회 관리" },
  { href: "/admin/roster", label: "로스터 관리" },
  { href: "/admin/universities", label: "학교 관리" },
  { href: "/admin/hero-media", label: "히어로 미디어" },
  { href: "/admin/prediction", label: "승부예측 설정" },
  { href: "/admin/rankings", label: "순위 관리" },
  { href: "/", label: "홈으로" },
];

export function AdminNav() {
  const pathname = usePathname();

  return (
    <nav className="flex flex-wrap items-center gap-2 mb-8 p-1 bg-white/5 border border-white/10 rounded-2xl w-fit">
      {ADMIN_LINKS.map((link) => {
        const isActive = pathname === link.href;
        return (
          <Link
            key={link.href}
            href={link.href}
            className={`px-4 py-2 text-xs font-black uppercase tracking-widest rounded-xl transition-all ${
              isActive
                ? "bg-nzu-green text-black shadow-[0_0_15px_rgba(30,215,96,0.3)]"
                : "text-white/40 hover:text-white hover:bg-white/5"
            }`}
          >
            {link.label}
          </Link>
        );
      })}
    </nav>
  );
}
