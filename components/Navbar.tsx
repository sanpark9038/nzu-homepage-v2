"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const navItems = [
  { href: "/",       label: "홈" },
  { href: "/live",   label: "라이브" },
  { href: "/tier",   label: "티어표" },
  { href: "/entry",  label: "엔트리" },
  { href: "/players",label: "선수" },
  { href: "/admin/match", label: "어드민" },
];

export default function Navbar() {
  const pathname = usePathname();

  return (
    <header className="sticky top-0 z-50 w-full border-b border-border/60 bg-background/90 backdrop-blur-md">
      <div className="w-full px-8 h-16 flex items-center justify-between">

        {/* 로고 */}
        <Link href="/" className="flex items-center gap-2 group">
          <div className="w-7 h-7 rounded bg-nzu-green flex items-center justify-center text-xs font-bold text-white group-hover:glow-green transition-all">
            N
          </div>
          <span className="font-bold text-sm tracking-widest text-foreground/90 group-hover:text-nzu-green transition-colors">
            늪지대
            <span className="text-muted-foreground font-normal ml-1.5 text-xs tracking-normal">NZU</span>
          </span>
        </Link>

        {/* 네비게이션 */}
        <nav className="flex items-center gap-1">
          {navItems.map((item) => {
            const isActive = pathname === item.href;
            return (
              <Link
                key={item.href}
                href={item.href}
                className={`
                  px-3 py-1.5 rounded text-sm font-medium transition-all duration-150
                  ${isActive
                    ? "text-nzu-green bg-nzu-green/10"
                    : "text-muted-foreground hover:text-foreground hover:bg-white/5"
                  }
                `}
              >
                {item.label}
              </Link>
            );
          })}
        </nav>

      </div>
    </header>
  );
}
