"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import { Grid, LogOut, Trophy, User } from "lucide-react";

import { visibleNavbarLinks } from "@/lib/navigation-config";
import type { PublicAuthSession } from "@/lib/public-auth";
import { cn } from "@/lib/utils";

type NavbarSession = Pick<PublicAuthSession, "avatarUrl" | "displayName" | "provider">;

function normalizeNavbarPathname(value: string | null | undefined) {
  const pathname = String(value || "").trim();
  if (pathname === "/index") return "/";
  return pathname;
}

function resolveNavbarPathname(pathname: string | null) {
  return normalizeNavbarPathname(pathname);
}

export default function Navbar() {
  const pathname = usePathname();
  const resolvedPathname = resolveNavbarPathname(pathname);
  const [session, setSession] = useState<NavbarSession | null>(null);
  const isHome = resolvedPathname === "/";

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
    <header
      className={cn(
        "z-[100] w-full border-b border-white/8 backdrop-blur-2xl transition-colors duration-200",
        isHome ? "fixed top-0 bg-background/18" : "sticky top-0 bg-background/72"
      )}
    >
      <div className="flex h-16 w-full items-center justify-between gap-4 px-4 lg:gap-8 lg:px-8">
        <Link href="/" prefetch={false} className="flex shrink-0 items-center group">
          <span className="text-xl font-black tracking-tighter text-white transition-colors duration-300 group-hover:text-nzu-green">
            HOSAGA
          </span>
        </Link>

        <nav className="hidden flex-1 items-center justify-center gap-2 lg:flex">
          {visibleNavbarLinks.map((item) => {
            const isActive = resolvedPathname === item.href;
            const showTierLiveBadge = item.href === "/tier";
            const showTeamsBadge = item.href === "/teams";

            return (
              <Link
                key={item.href}
                href={item.href}
                prefetch={false}
                className={cn(
                  "ui-label relative flex min-h-[40px] items-center gap-2 whitespace-nowrap rounded-full px-5 py-2 tracking-tight transition-colors duration-200",
                  showTeamsBadge && isActive
                    ? "border border-emerald-200/70 bg-emerald-300/20 text-white shadow-[0_0_0_1px_rgba(110,231,183,0.28),0_0_26px_rgba(16,185,129,0.18)]"
                    : showTeamsBadge
                      ? "border border-emerald-300/45 bg-emerald-300/12 text-emerald-50 shadow-[inset_0_1px_0_rgba(255,255,255,0.06)] hover:border-emerald-200/70 hover:bg-emerald-300/18 hover:text-white"
                      : isActive
                    ? "bg-nzu-green/16 text-nzu-green shadow-[0_0_0_1px_rgba(0,168,107,0.12)]"
                    : "text-foreground/56 hover:bg-white/7 hover:text-foreground"
                )}
              >
                {showTeamsBadge ? (
                  <Trophy
                    size={16}
                    className={cn("shrink-0", isActive ? "text-emerald-100" : "text-emerald-200")}
                    aria-hidden="true"
                  />
                ) : null}
                {item.label}
                {showTeamsBadge ? (
                  <span
                    className={cn(
                      "hidden rounded-full border px-2 py-0.5 text-[0.625rem] font-black uppercase tracking-[0.16em] xl:inline-flex",
                      isActive
                        ? "border-emerald-100/50 bg-black/20 text-emerald-50"
                        : "border-emerald-200/35 bg-emerald-950/45 text-emerald-100"
                    )}
                  >
                    EVENT
                  </span>
                ) : null}
                {showTierLiveBadge ? (
                  <span
                    className={cn(
                      "inline-flex items-center rounded-full border px-2 py-0.5 text-[0.6875rem] font-black uppercase tracking-[0.18em]",
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

        <div className="flex items-center gap-2 text-foreground/56 lg:gap-4">
          <div className="mx-2 hidden h-6 w-[1px] bg-white/10 lg:block" />
          {session ? (
            <div className="flex items-center gap-2">
              <div className="ui-label hidden min-h-[40px] items-center gap-2 rounded-full border border-white/10 bg-white/[0.045] px-4 py-2 text-foreground md:flex">
                <User size={18} />
                <span className="max-w-[160px] truncate" title={session.displayName}>
                  {session.displayName}
                </span>
              </div>
              <a
                href="/api/auth/soop/logout"
                className="ui-label flex min-h-[40px] items-center gap-2 rounded-full px-3 py-2 text-foreground transition-colors hover:bg-white/7 lg:px-4"
              >
                <LogOut size={18} />
                <span>LOGOUT</span>
              </a>
            </div>
          ) : (
            <a
              href="/api/auth/soop/start?next=/board"
              className="ui-label flex min-h-[40px] items-center gap-2 rounded-full px-3 py-2 text-foreground transition-colors hover:bg-white/7 lg:px-4"
            >
              <User size={18} />
              <span>LOGIN</span>
            </a>
          )}
          <button
            type="button"
            className="inline-flex min-h-[40px] min-w-[40px] items-center justify-center rounded-full transition-colors hover:bg-white/7 hover:text-foreground"
          >
            <Grid size={20} />
          </button>
        </div>
      </div>
    </header>
  );
}
