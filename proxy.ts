import { NextRequest, NextResponse } from "next/server";
import { ADMIN_SESSION_COOKIE, isAdminConfigured, isValidAdminSession } from "@/lib/admin-auth";

function isAllowedPath(pathname: string) {
  return pathname === "/admin/login" || pathname === "/api/admin/session";
}

export function proxy(req: NextRequest) {
  const { pathname } = req.nextUrl;
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
  matcher: ["/admin/:path*", "/api/admin/:path*"],
};
