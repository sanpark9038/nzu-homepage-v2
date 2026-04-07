import { NextResponse } from "next/server";
import { ADMIN_SESSION_COOKIE, adminAccessKey, isAdminConfigured } from "@/lib/admin-auth";

export const runtime = "nodejs";

export async function POST(req: Request) {
  const body = (await req.json().catch(() => ({}))) as { password?: string };
  const password = String(body.password || "");
  const key = adminAccessKey();

  if (!isAdminConfigured()) {
    return NextResponse.json({ ok: false, message: "ADMIN_ACCESS_KEY is not configured" }, { status: 500 });
  }

  if (password !== key) {
    return NextResponse.json({ ok: false, message: "비밀번호가 올바르지 않습니다." }, { status: 401 });
  }

  const res = NextResponse.json({ ok: true });
  res.cookies.set(ADMIN_SESSION_COOKIE, key, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: 60 * 60 * 12,
  });
  return res;
}

export async function DELETE() {
  const res = NextResponse.json({ ok: true });
  res.cookies.set(ADMIN_SESSION_COOKIE, "", {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: 0,
  });
  return res;
}
