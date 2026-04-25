import { NextResponse } from "next/server";
import { cookies } from "next/headers";

import {
  createPublicAuthSessionCookieValue,
  isPublicAuthSessionConfigured,
  PUBLIC_AUTH_SESSION_COOKIE,
} from "@/lib/public-auth";
import {
  buildPublicSessionFromSoopProfile,
  describeSoopTokenShape,
  describeSoopUserInfoShape,
  exchangeSoopAuthorizationCode,
  fetchSoopStationInfo,
  normalizeNextPath,
  SOOP_AUTH_DEFAULT_NEXT_PATH,
  SOOP_AUTH_STATE_COOKIE,
} from "@/lib/soop-auth";

export const runtime = "nodejs";

function buildRedirectTarget(requestUrl: string, nextPath: string, status: string) {
  const url = new URL(nextPath, requestUrl);
  url.searchParams.set("login", status);
  return url;
}

function buildFailureRedirectTarget(requestUrl: string, nextPath: string, status: string) {
  const safeNextPath = nextPath === "/board/write" ? "/board" : nextPath;
  return buildRedirectTarget(requestUrl, safeNextPath, status);
}

export async function GET(req: Request) {
  const requestUrl = new URL(req.url);
  const code = String(requestUrl.searchParams.get("code") || "").trim();
  const state = String(requestUrl.searchParams.get("state") || "").trim();
  const cookieStore = await cookies();
  const storedState = String(cookieStore.get(SOOP_AUTH_STATE_COOKIE)?.value || "").trim();
  const nextPath = normalizeNextPath(storedState.split(":").slice(1).join(":") || SOOP_AUTH_DEFAULT_NEXT_PATH);

  if (!code || !state || !storedState || state !== storedState) {
    const response = NextResponse.redirect(buildFailureRedirectTarget(req.url, nextPath, "soop-state-mismatch"));
    response.cookies.set(SOOP_AUTH_STATE_COOKIE, "", {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
      path: "/",
      maxAge: 0,
    });
    return response;
  }

  try {
    const tokenPayload = await exchangeSoopAuthorizationCode(code);
    const stationInfo = await fetchSoopStationInfo(String(tokenPayload.access_token || ""));
    const session = buildPublicSessionFromSoopProfile(stationInfo);

    if (!session) {
      console.warn("[SOOP auth] Unable to derive public session from token/userinfo", {
        token: describeSoopTokenShape(tokenPayload),
        userinfo: describeSoopUserInfoShape(stationInfo),
      });
      const response = NextResponse.redirect(buildFailureRedirectTarget(req.url, nextPath, "soop-userinfo-missing"));
      response.cookies.set(SOOP_AUTH_STATE_COOKIE, "", {
        httpOnly: true,
        secure: process.env.NODE_ENV === "production",
        sameSite: "lax",
        path: "/",
        maxAge: 0,
      });
      return response;
    }

    if (!isPublicAuthSessionConfigured()) {
      const response = NextResponse.redirect(buildFailureRedirectTarget(req.url, nextPath, "public-session-not-configured"));
      response.cookies.set(SOOP_AUTH_STATE_COOKIE, "", {
        httpOnly: true,
        secure: process.env.NODE_ENV === "production",
        sameSite: "lax",
        path: "/",
        maxAge: 0,
      });
      return response;
    }

    const response = NextResponse.redirect(new URL(nextPath, req.url));
    response.cookies.set(SOOP_AUTH_STATE_COOKIE, "", {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
      path: "/",
      maxAge: 0,
    });
    response.cookies.set(PUBLIC_AUTH_SESSION_COOKIE, createPublicAuthSessionCookieValue(session), {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
      path: "/",
      maxAge: 60 * 60 * 12,
    });
    return response;
  } catch (error) {
    console.error("[SOOP auth] Token exchange failed", error);
    const response = NextResponse.redirect(buildFailureRedirectTarget(req.url, nextPath, "soop-token-failed"));
    response.cookies.set(SOOP_AUTH_STATE_COOKIE, "", {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
      path: "/",
      maxAge: 0,
    });
    return response;
  }
}
