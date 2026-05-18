import { cookies } from "next/headers";
import { revalidatePath } from "next/cache";
import { NextResponse } from "next/server";

import { ADMIN_SESSION_COOKIE, isValidAdminSession } from "@/lib/admin-auth";
import {
  buildBoardCommentAuthorId,
  canDeleteBoardComment,
  getBoardCommentForMutation,
  isBoardCommentsStorageMissing,
  softDeleteBoardComment,
} from "@/lib/board-comments";
import { parsePublicAuthSessionCookieValue, PUBLIC_AUTH_SESSION_COOKIE } from "@/lib/public-auth";

export const runtime = "nodejs";

export async function DELETE(
  _req: Request,
  { params }: { params: Promise<{ id: string; commentId: string }> }
) {
  const { id, commentId } = await params;
  try {
    const cookieStore = await cookies();
    const session = parsePublicAuthSessionCookieValue(cookieStore.get(PUBLIC_AUTH_SESSION_COOKIE)?.value);
    const isAdmin = isValidAdminSession(cookieStore.get(ADMIN_SESSION_COOKIE)?.value);
    const currentAuthorId = session ? buildBoardCommentAuthorId(session.provider, session.providerUserId) : null;

    const comment = await getBoardCommentForMutation(commentId);
    if (!comment || comment.post_id !== id || comment.deleted_at) {
      return NextResponse.json({ ok: false, message: "댓글을 찾을 수 없습니다." }, { status: 404 });
    }

    if (!canDeleteBoardComment({ isAdmin, authorId: comment.author_id, currentAuthorId })) {
      return NextResponse.json({ ok: false, message: "삭제 권한이 없습니다." }, { status: 403 });
    }

    const deletedBy = isAdmin ? "admin" : currentAuthorId || "";
    const deleted = await softDeleteBoardComment(commentId, deletedBy);
    revalidatePath("/board");
    revalidatePath(`/board/${id}`);
    return NextResponse.json({ ok: true, comment: deleted });
  } catch (error) {
    if (isBoardCommentsStorageMissing(error)) {
      return NextResponse.json({ ok: false, message: "댓글 기능을 준비 중입니다." }, { status: 503 });
    }
    return NextResponse.json({ ok: false, message: "댓글을 삭제하지 못했습니다." }, { status: 500 });
  }
}
