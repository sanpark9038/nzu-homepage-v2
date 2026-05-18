import { cookies } from "next/headers";
import { revalidatePath } from "next/cache";
import { NextResponse } from "next/server";

import {
  assertBoardCommentRateLimit,
  buildBoardCommentAuthorId,
  createBoardComment,
  isBoardCommentsStorageMissing,
  listVisibleBoardComments,
  normalizeBoardCommentInput,
  validateBoardCommentInput,
} from "@/lib/board-comments";
import { getBoardPostForMutation } from "@/lib/board";
import { parsePublicAuthSessionCookieValue, PUBLIC_AUTH_SESSION_COOKIE } from "@/lib/public-auth";

export const runtime = "nodejs";

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  try {
    const result = await listVisibleBoardComments(id);
    return NextResponse.json(result);
  } catch {
    return NextResponse.json({ ok: false, message: "댓글을 불러오지 못했습니다." }, { status: 500 });
  }
}

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  try {
    const cookieStore = await cookies();
    const session = parsePublicAuthSessionCookieValue(cookieStore.get(PUBLIC_AUTH_SESSION_COOKIE)?.value);
    if (!session) {
      return NextResponse.json({ ok: false, message: "SOOP 로그인 후 댓글을 작성할 수 있습니다." }, { status: 401 });
    }

    const post = await getBoardPostForMutation(id);
    if (!post || post.published === false) {
      return NextResponse.json({ ok: false, message: "게시글을 찾을 수 없습니다." }, { status: 404 });
    }

    const body = (await req.json().catch(() => ({}))) as Record<string, unknown>;
    const input = normalizeBoardCommentInput(body);
    const validationMessage = validateBoardCommentInput(input);
    if (validationMessage) {
      return NextResponse.json({ ok: false, message: validationMessage }, { status: 400 });
    }

    const authorId = buildBoardCommentAuthorId(session.provider, session.providerUserId);
    await assertBoardCommentRateLimit(authorId);
    const comment = await createBoardComment({
      postId: id,
      authorId,
      authorName: session.displayName,
      content: input.content,
    });

    revalidatePath("/board");
    revalidatePath(`/board/${id}`);
    return NextResponse.json({ ok: true, comment });
  } catch (error) {
    if (error instanceof Error && error.name === "BoardCommentRateLimitError") {
      return NextResponse.json({ ok: false, message: "잠시 후 다시 작성해 주세요." }, { status: 429 });
    }
    if (isBoardCommentsStorageMissing(error)) {
      return NextResponse.json({ ok: false, message: "댓글 기능을 준비 중입니다." }, { status: 503 });
    }
    return NextResponse.json(
      { ok: false, message: "댓글을 등록하지 못했습니다. 잠시 후 다시 시도해 주세요." },
      { status: 500 }
    );
  }
}
