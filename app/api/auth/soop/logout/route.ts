import { NextResponse } from "next/server";

import { PUBLIC_AUTH_SESSION_COOKIE } from "@/lib/public-auth";

export const runtime = "nodejs";

export async function GET(req: Request) {
  const redirectUrl = new URL("/board?login=logged-out", req.url);
  const response = NextResponse.redirect(redirectUrl);
  response.cookies.set(PUBLIC_AUTH_SESSION_COOKIE, "", {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: 0,
  });
  return response;
}
