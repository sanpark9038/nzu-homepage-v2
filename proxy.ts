import { NextRequest, NextResponse } from "next/server";
import { ADMIN_SESSION_COOKIE, isAdminConfigured, isValidAdminSession } from "@/lib/admin-auth";

const APEX_HOST = "star-hosaga.com";
const CANONICAL_HOST = "www.star-hosaga.com";
const TIER_QUERY_KEYS = ["liveOnly", "search", "race", "univ", "tier", "raceToggle"];

function isAllowedPath(pathname: string) {
  return (
    pathname === "/admin/login" ||
    pathname === "/api/admin/session" ||
    pathname === "/api/admin/revalidate-serving"
  );
}

function getRequestHost(req: NextRequest) {
  return (req.headers.get("host") || "").split(":")[0].toLowerCase();
}

export function proxy(req: NextRequest) {
  const { pathname } = req.nextUrl;
  const host = getRequestHost(req);

  if (host === APEX_HOST) {
    const redirectUrl = req.nextUrl.clone();
    redirectUrl.hostname = CANONICAL_HOST;
    redirectUrl.protocol = "https:";
    return NextResponse.redirect(redirectUrl, 308);
  }

  if (pathname === "/tier" && TIER_QUERY_KEYS.some((key) => req.nextUrl.searchParams.has(key))) {
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
    "/:path*",
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
