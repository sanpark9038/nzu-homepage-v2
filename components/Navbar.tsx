"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import { Grid, LogOut, User } from "lucide-react";

import { visibleNavbarLinks } from "@/lib/navigation-config";
import type { PublicAuthSession } from "@/lib/public-auth";
import { cn } from "@/lib/utils";

type NavbarSession = Pick<PublicAuthSession, "avatarUrl" | "displayName" | "provider">;

// 섹션별 accent — 모든 클래스 문자열은 Tailwind JIT 스캔을 위해 리터럴로 작성
const NAV_ACCENT: Record<string, {
  activeBg: string;
  accentText: string;
  glowRgba: string;
  hoverBg: string;
  hoverText: string;
}> = {
  "/":           { activeBg: "bg-white/10",       accentText: "text-white",      glowRgba: "rgba(255,255,255,0.10)", hoverBg: "hover:bg-white/5",        hoverText: "hover:text-white" },
  "/board":      { activeBg: "bg-sky-400/10",     accentText: "text-sky-300",    glowRgba: "rgba(56,189,248,0.18)",  hoverBg: "hover:bg-sky-400/5",      hoverText: "hover:text-sky-300" },
  "/schedule":   { activeBg: "bg-sky-400/10",     accentText: "text-sky-300",    glowRgba: "rgba(56,189,248,0.18)",  hoverBg: "hover:bg-sky-400/5",      hoverText: "hover:text-sky-300" },
  "/prediction": { activeBg: "bg-amber-400/10",   accentText: "text-amber-300",  glowRgba: "rgba(251,191,36,0.20)",  hoverBg: "hover:bg-amber-400/5",    hoverText: "hover:text-amber-300" },
  "/tier":       { activeBg: "bg-red-400/10",     accentText: "text-red-300",    glowRgba: "rgba(248,113,113,0.20)", hoverBg: "hover:bg-red-400/5",      hoverText: "hover:text-red-300" },
  "/player":     { activeBg: "bg-nzu-green/10",   accentText: "text-nzu-green",  glowRgba: "rgba(0,168,107,0.20)",   hoverBg: "hover:bg-nzu-green/5",    hoverText: "hover:text-nzu-green" },
  "/match":      { activeBg: "bg-violet-400/10",  accentText: "text-violet-300", glowRgba: "rgba(167,139,250,0.20)", hoverBg: "hover:bg-violet-400/5",   hoverText: "hover:text-violet-300" },
  "/entry":      { activeBg: "bg-indigo-400/10",  accentText: "text-indigo-300", glowRgba: "rgba(129,140,248,0.20)", hoverBg: "hover:bg-indigo-400/5",   hoverText: "hover:text-indigo-300" },
  "/multiview":  { activeBg: "bg-rose-400/10",   accentText: "text-rose-300",   glowRgba: "rgba(251,113,133,0.20)", hoverBg: "hover:bg-rose-400/5",     hoverText: "hover:text-rose-300" },
};

const DEFAULT_ACCENT = NAV_ACCENT["/"];

function normalizeNavbarPathname(value: string | null | undefined) {
  const pathname = String(value || "").trim();
  if (pathname === "/index") return "/";
  return pathname;
}

const OVERLAY_VIEWER_ROUTES = ["/overlay/scoreboard", "/overlay/entry", "/overlay/view"];

export default function Navbar() {
  const pathname = usePathname();
  if (OVERLAY_VIEWER_ROUTES.some((r) => pathname?.startsWith(r))) return null;
  const resolvedPathname = normalizeNavbarPathname(pathname);
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

        {/* ── 로고 ── */}
        <Link href="/" prefetch={false} className="group flex shrink-0 items-center">
          <span className="text-xl font-black tracking-tighter text-white transition-colors duration-300 group-hover:text-nzu-green">
            HOSAGA
          </span>
        </Link>

        {/* ── 네브 링크 ── */}
        <nav className="hidden flex-1 items-center justify-center lg:flex">
          <div className="flex flex-nowrap items-center gap-0.5 rounded-2xl border border-white/[0.06] bg-white/[0.025] px-1.5 py-1.5">
            {visibleNavbarLinks.map((item) => {
              const isActive = resolvedPathname === item.href;
              const showLiveBadge = item.href === "/tier";
              const accent = NAV_ACCENT[item.href] ?? DEFAULT_ACCENT;

              return (
                <Link
                  key={item.href}
                  href={item.href}
                  prefetch={false}
                  className={cn(
                    "inline-flex items-center gap-1.5 whitespace-nowrap rounded-xl px-4 py-2 text-[0.8125rem] font-semibold tracking-tight transition-all duration-200",
                    isActive
                      ? [accent.activeBg, accent.accentText]
                      : ["text-foreground/52", accent.hoverBg, accent.hoverText],
                  )}
                  style={isActive ? { boxShadow: `0 0 16px ${accent.glowRgba}` } : undefined}
                >
                  {item.label}
                  {showLiveBadge ? (
                    <span
                      className={cn(
                        "inline-flex items-center rounded-full border px-1.5 py-px text-[0.625rem] font-bold uppercase tracking-[0.16em]",
                        isActive
                          ? "border-red-400/50 bg-red-500/18 text-red-200"
                          : "border-red-400/28 bg-red-500/10 text-red-300"
                      )}
                    >
                      LIVE
                    </span>
                  ) : null}
                </Link>
              );
            })}
          </div>
        </nav>

        {/* ── 우측 (로그인/로그아웃) ── */}
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
            aria-label="메뉴 열기"
            className="inline-flex min-h-[40px] min-w-[40px] items-center justify-center rounded-full transition-colors hover:bg-white/7 hover:text-foreground"
          >
            <Grid size={20} aria-hidden="true" />
          </button>
        </div>
      </div>
    </header>
  );
}
