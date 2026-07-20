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

  // Query-bearing board/player URLs rewrite to dynamic query pages; bare menu URLs stay cacheable.
  if (pathname === "/board") {
    const rewriteUrl = req.nextUrl.clone();
    rewriteUrl.pathname = "/board/query";
    return NextResponse.rewrite(rewriteUrl);
  }

  if (pathname === "/player") {
    const rewriteUrl = req.nextUrl.clone();
    rewriteUrl.pathname = "/player/query";
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
    { source: "/board", has: [{ type: "query", key: "filter" }] },
    { source: "/board", has: [{ type: "query", key: "login" }] },
    { source: "/board", has: [{ type: "query", key: "download" }] },
    { source: "/board", has: [{ type: "query", key: "page" }] },
    { source: "/board", has: [{ type: "query", key: "q" }] },
    { source: "/player", has: [{ type: "query", key: "query" }] },
    { source: "/player", has: [{ type: "query", key: "id" }] },
    "/admin/:path*",
    "/api/admin/:path*",
  ],
};
