import { NextResponse } from "next/server";
import { cookies } from "next/headers";

import { getBoardPostById } from "@/lib/board";
import { parsePublicAuthSessionCookieValue, PUBLIC_AUTH_SESSION_COOKIE } from "@/lib/public-auth";
import { normalizeNextPath } from "@/lib/soop-auth";

export const runtime = "nodejs";

export async function GET(req: Request) {
  const requestUrl = new URL(req.url);
  const id = String(requestUrl.searchParams.get("id") || "").trim();
  const next = normalizeNextPath(requestUrl.searchParams.get("next"));

  if (!id) {
    return NextResponse.redirect(new URL(`${next}?download=missing`, req.url));
  }

  const post = await getBoardPostById(id);
  const target = String(post?.download_url || "").trim();

  let parsedTarget: URL;
  try {
    parsedTarget = new URL(target);
  } catch {
    return NextResponse.redirect(new URL(`${next}?download=invalid`, req.url));
  }

  if (!["http:", "https:"].includes(parsedTarget.protocol)) {
    return NextResponse.redirect(new URL(`${next}?download=invalid`, req.url));
  }

  const cookieStore = await cookies();
  const session = parsePublicAuthSessionCookieValue(cookieStore.get(PUBLIC_AUTH_SESSION_COOKIE)?.value);

  if (!session) {
    return NextResponse.redirect(new URL(`/api/auth/soop/start?next=${encodeURIComponent(next)}`, req.url));
  }

  return NextResponse.redirect(parsedTarget);
}
