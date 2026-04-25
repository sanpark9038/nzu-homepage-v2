import { cookies } from "next/headers";
import { NextResponse } from "next/server";

import { parsePublicAuthSessionCookieValue, PUBLIC_AUTH_SESSION_COOKIE } from "@/lib/public-auth";

export const runtime = "nodejs";

export async function GET() {
  const cookieStore = await cookies();
  const session = parsePublicAuthSessionCookieValue(cookieStore.get(PUBLIC_AUTH_SESSION_COOKIE)?.value);

  return NextResponse.json({
    ok: true,
    session: session
      ? {
          provider: session.provider,
          displayName: session.displayName,
          avatarUrl: session.avatarUrl,
        }
      : null,
  });
}
