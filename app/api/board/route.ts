import { cookies } from "next/headers";
import { NextResponse } from "next/server";

import {
  createBoardPost,
  isBoardStorageMissing,
  listBoardPosts,
  normalizeBoardPostInput,
  validateBoardPostInput,
} from "@/lib/board";
import { parsePublicAuthSessionCookieValue, PUBLIC_AUTH_SESSION_COOKIE } from "@/lib/public-auth";

export const runtime = "nodejs";

export async function GET() {
  try {
    const result = await listBoardPosts();
    return NextResponse.json({
      ok: true,
      posts: result.posts,
      storage_ready: result.storageReady,
    });
  } catch (error) {
    return NextResponse.json(
      {
        ok: false,
        message: error instanceof Error ? error.message : "failed to load board posts",
      },
      { status: 500 }
    );
  }
}

export async function POST(req: Request) {
  try {
    const cookieStore = await cookies();
    const session = parsePublicAuthSessionCookieValue(cookieStore.get(PUBLIC_AUTH_SESSION_COOKIE)?.value);
    if (!session) {
      return NextResponse.json({ ok: false, message: "로그인 후 글을 작성해 주세요." }, { status: 401 });
    }

    const body = (await req.json().catch(() => ({}))) as Record<string, unknown>;
    const input = normalizeBoardPostInput({
      ...body,
      author_name: session.displayName,
      author_provider: session.provider,
      author_provider_user_id: session.providerUserId,
      category: null,
      download_url: null,
    });
    const validationMessage = validateBoardPostInput(input);

    if (validationMessage) {
      return NextResponse.json({ ok: false, message: validationMessage }, { status: 400 });
    }

    const post = await createBoardPost(input);
    return NextResponse.json({ ok: true, post }, { status: 201 });
  } catch (error) {
    if (isBoardStorageMissing(error)) {
      return NextResponse.json(
        {
          ok: false,
          message: "board_posts 테이블이 아직 준비되지 않았습니다. scripts/sql/create-board-posts.sql을 먼저 적용해 주세요.",
        },
        { status: 503 }
      );
    }

    return NextResponse.json(
      {
        ok: false,
        message: error instanceof Error ? error.message : "failed to create board post",
      },
      { status: 500 }
    );
  }
}
