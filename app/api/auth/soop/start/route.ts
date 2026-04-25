import { NextResponse } from "next/server";

import {
  buildSoopAuthorizationUrl,
  createSoopState,
  isSoopOAuthConfigured,
  normalizeNextPath,
  SOOP_AUTH_STATE_COOKIE,
} from "@/lib/soop-auth";

export const runtime = "nodejs";

export async function GET(req: Request) {
  if (!isSoopOAuthConfigured()) {
    return NextResponse.redirect(new URL("/board?login=soop-not-configured", req.url));
  }

  const { searchParams } = new URL(req.url);
  const nextPath = normalizeNextPath(searchParams.get("next"));
  const state = createSoopState(nextPath);
  const response = NextResponse.redirect(buildSoopAuthorizationUrl(state));

  response.cookies.set(SOOP_AUTH_STATE_COOKIE, state, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: 60 * 10,
  });

  return response;
}
