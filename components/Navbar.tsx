"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import { Grid, LogOut, User } from "lucide-react";

import { visibleNavbarLinks } from "@/lib/navigation-config";
import type { PublicAuthSession } from "@/lib/public-auth";
import { cn } from "@/lib/utils";

type NavbarSession = Pick<PublicAuthSession, "avatarUrl" | "displayName" | "provider">;

export default function Navbar() {
  const pathname = usePathname();
  const [session, setSession] = useState<NavbarSession | null>(null);

  useEffect(() => {
    let active = true;

    fetch("/api/auth/session", { cache: "no-store" })
      .then((response) => (response.ok ? response.json() : null))
      .then((payload: { session?: NavbarSession | null } | null) => {
        if (active) setSession(payload?.session || null);
      })
      .catch(() => {
        if (active) setSession(null);
      });

    return () => {
      active = false;
    };
  }, []);

  return (
    <header className="sticky top-0 z-[100] w-full border-b border-white/5 bg-background/60 backdrop-blur-3xl transition-all duration-300">
      <div className="flex h-16 w-full items-center justify-between gap-8 px-8">
        <Link href="/" className="flex shrink-0 items-center group">
          <span className="text-xl font-black tracking-tighter text-white transition-colors duration-300 group-hover:text-nzu-green">
            HOSAGA
          </span>
        </Link>

        <nav className="flex flex-1 items-center justify-center gap-2">
          {visibleNavbarLinks.map((item) => {
            const isActive = pathname === item.href;
            const showTierLiveBadge = item.href === "/tier";

            return (
              <Link
                key={item.href}
                href={item.href}
                className={cn(
                  "relative flex items-center gap-2 rounded-full px-6 py-2 text-[14px] font-black tracking-tight transition-all duration-300",
                  isActive
                    ? "bg-nzu-green/10 text-nzu-green"
                    : "text-foreground/40 hover:bg-white/5 hover:text-foreground"
                )}
              >
                {item.label}
                {showTierLiveBadge ? (
                  <span
                    className={cn(
                      "inline-flex items-center rounded-full border px-2 py-0.5 text-[10px] font-black uppercase tracking-[0.18em]",
                      isActive
                        ? "border-red-400/50 bg-red-500/18 text-red-200"
                        : "border-red-400/30 bg-red-500/12 text-red-300"
                    )}
                  >
                    LIVE
                  </span>
                ) : null}
              </Link>
            );
          })}
        </nav>

        <div className="flex items-center gap-4 text-foreground/40">
          <div className="mx-2 h-6 w-[1px] bg-white/10" />
          {session ? (
            <div className="flex items-center gap-2">
              <div className="hidden items-center gap-2 rounded-lg border border-white/10 bg-white/[0.03] px-4 py-2 text-sm font-black text-foreground md:flex">
                <User size={18} />
                <span className="max-w-[160px] truncate" title={session.displayName}>
                  {session.displayName}
                </span>
              </div>
              <a
                href="/api/auth/soop/logout"
                className="flex items-center gap-2 rounded-lg px-4 py-2 text-sm font-black text-foreground transition-all hover:bg-white/5"
              >
                <LogOut size={18} />
                <span>LOGOUT</span>
              </a>
            </div>
          ) : (
            <a
              href="/api/auth/soop/start?next=/board"
              className="flex items-center gap-2 rounded-lg px-4 py-2 text-sm font-black text-foreground transition-all hover:bg-white/5"
            >
              <User size={18} />
              <span>LOGIN</span>
            </a>
          )}
          <button className="rounded-lg p-2 transition-all hover:bg-white/5 hover:text-foreground">
            <Grid size={20} />
          </button>
        </div>
      </div>
    </header>
  );
}
