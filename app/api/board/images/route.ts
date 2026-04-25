import { cookies } from "next/headers";
import { NextResponse } from "next/server";

import { parsePublicAuthSessionCookieValue, PUBLIC_AUTH_SESSION_COOKIE } from "@/lib/public-auth";
import { BoardImageUploadError, uploadBoardImageToR2 } from "@/lib/r2";

export const runtime = "nodejs";

const MAX_MULTIPART_BODY_BYTES = 6 * 1024 * 1024;
const UPLOAD_RATE_LIMIT_WINDOW_MS = 10 * 60 * 1000;
const UPLOAD_RATE_LIMIT_COUNT = 10;
const uploadAttempts = new Map<string, number[]>();

function isSameOriginRequest(req: Request) {
  const origin = req.headers.get("origin");
  if (!origin) return true;

  try {
    return origin === new URL(req.url).origin;
  } catch {
    return false;
  }
}

function isFile(value: FormDataEntryValue | null): value is File {
  return typeof File !== "undefined" && value instanceof File;
}

function isBodyTooLarge(req: Request) {
  const rawContentLength = req.headers.get("content-length");
  if (!rawContentLength) return false;

  const contentLength = Number(rawContentLength);
  return Number.isFinite(contentLength) && contentLength > MAX_MULTIPART_BODY_BYTES;
}

function assertBoardImageUploadRateLimit(sessionKey: string) {
  const now = Date.now();
  const recentAttempts = (uploadAttempts.get(sessionKey) || []).filter(
    (timestamp) => now - timestamp < UPLOAD_RATE_LIMIT_WINDOW_MS
  );

  if (recentAttempts.length >= UPLOAD_RATE_LIMIT_COUNT) {
    throw new BoardImageUploadError("이미지 업로드가 잠시 많습니다. 조금 뒤에 다시 시도해 주세요.", "upload_rate_limited");
  }

  recentAttempts.push(now);
  uploadAttempts.set(sessionKey, recentAttempts);
}

export async function POST(req: Request) {
  if (!isSameOriginRequest(req)) {
    return NextResponse.json({ ok: false, message: "허용되지 않은 업로드 요청입니다." }, { status: 403 });
  }

  if (isBodyTooLarge(req)) {
    return NextResponse.json({ ok: false, message: "이미지는 5MB 이하로 올려 주세요." }, { status: 413 });
  }

  const cookieStore = await cookies();
  const session = parsePublicAuthSessionCookieValue(cookieStore.get(PUBLIC_AUTH_SESSION_COOKIE)?.value);
  if (!session) {
    return NextResponse.json({ ok: false, message: "이미지 업로드는 SOOP 로그인 후 사용할 수 있습니다." }, { status: 401 });
  }

  try {
    assertBoardImageUploadRateLimit(`${session.provider}:${session.providerUserId}`);

    const formData = await req.formData();
    const file = formData.get("file");

    if (!isFile(file)) {
      return NextResponse.json({ ok: false, message: "업로드할 이미지를 선택해 주세요." }, { status: 400 });
    }

    const image = await uploadBoardImageToR2(file);
    return NextResponse.json({ ok: true, image });
  } catch (error) {
    if (error instanceof BoardImageUploadError) {
      return NextResponse.json(
        { ok: false, message: error.message },
        { status: error.code === "r2_not_configured" ? 503 : error.code === "upload_rate_limited" ? 429 : 400 }
      );
    }

    return NextResponse.json({ ok: false, message: "이미지를 업로드하지 못했습니다." }, { status: 500 });
  }
}
