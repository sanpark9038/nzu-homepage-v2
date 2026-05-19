import { NextRequest, NextResponse } from "next/server";
import { ADMIN_SESSION_COOKIE, isAdminConfigured, isValidAdminSession } from "@/lib/admin-auth";

function isAllowedPath(pathname: string) {
  return (
    pathname === "/admin/login" ||
    pathname === "/api/admin/session" ||
    pathname === "/api/admin/revalidate-serving"
  );
}

export function proxy(req: NextRequest) {
  const { pathname } = req.nextUrl;

  if (pathname === "/tier") {
    const rewriteUrl = req.nextUrl.clone();
    rewriteUrl.pathname = "/tier/query";
    return NextResponse.rewrite(rewriteUrl);
  }

  const isAdminPath = pathname.startsWith("/admin") || pathname.startsWith("/api/admin");
  if (!isAdminPath) return NextResponse.next();
  if (isAllowedPath(pathname)) return NextResponse.next();

  const sessionValue = req.cookies.get(ADMIN_SESSION_COOKIE)?.value;
  if (isAdminConfigured() && isValidAdminSession(sessionValue)) {
    return NextResponse.next();
  }

  if (pathname.startsWith("/api/admin")) {
    return NextResponse.json({ ok: false, message: "admin auth required" }, { status: 401 });
  }

  const loginUrl = new URL("/admin/login", req.url);
  loginUrl.searchParams.set("next", pathname);
  return NextResponse.redirect(loginUrl);
}

export const config = {
  matcher: [
    { source: "/tier", has: [{ type: "query", key: "liveOnly" }] },
    { source: "/tier", has: [{ type: "query", key: "search" }] },
    { source: "/tier", has: [{ type: "query", key: "race" }] },
    { source: "/tier", has: [{ type: "query", key: "univ" }] },
    { source: "/tier", has: [{ type: "query", key: "tier" }] },
    { source: "/tier", has: [{ type: "query", key: "raceToggle" }] },
    "/admin/:path*",
    "/api/admin/:path*",
  ],
};
