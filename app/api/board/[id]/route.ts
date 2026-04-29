import { cookies } from "next/headers";
import { revalidatePath } from "next/cache";
import { NextResponse } from "next/server";

import { ADMIN_SESSION_COOKIE, isValidAdminSession } from "@/lib/admin-auth";
import {
  deleteBoardPostById,
  getBoardPostForMutation,
  isBoardStorageMissing,
  normalizeBoardPostUpdateInput,
  updateBoardPostById,
  validateBoardPostUpdateInput,
  type BoardPostRow,
} from "@/lib/board";
import { parsePublicAuthSessionCookieValue, PUBLIC_AUTH_SESSION_COOKIE } from "@/lib/public-auth";
import { deleteBoardImageFromR2 } from "@/lib/r2";

export const runtime = "nodejs";

function canMutateBoardPost({
  isAdmin,
  sessionProvider,
  sessionProviderUserId,
  postAuthorProvider,
  postAuthorProviderUserId,
}: {
  isAdmin: boolean;
  sessionProvider: string | null;
  sessionProviderUserId: string | null;
  postAuthorProvider: string | null;
  postAuthorProviderUserId: string | null;
}) {
  if (isAdmin) return true;
  if (!sessionProvider || !sessionProviderUserId) return false;
  return sessionProvider === postAuthorProvider && sessionProviderUserId === postAuthorProviderUserId;
}

async function getBoardMutationContext(id: string): Promise<{ post: BoardPostRow } | { response: NextResponse }> {
  const cookieStore = await cookies();
  const publicSession = parsePublicAuthSessionCookieValue(cookieStore.get(PUBLIC_AUTH_SESSION_COOKIE)?.value);
  const isAdmin = isValidAdminSession(cookieStore.get(ADMIN_SESSION_COOKIE)?.value);

  if (!publicSession && !isAdmin) {
    return { response: NextResponse.json({ ok: false, message: "권한이 없습니다." }, { status: 401 }) };
  }

  const post = await getBoardPostForMutation(id);
  if (!post) {
    return { response: NextResponse.json({ ok: false, message: "게시글을 찾을 수 없습니다." }, { status: 404 }) };
  }

  const allowed = canMutateBoardPost({
    isAdmin,
    sessionProvider: publicSession?.provider || null,
    sessionProviderUserId: publicSession?.providerUserId || null,
    postAuthorProvider: post.author_provider,
    postAuthorProviderUserId: post.author_provider_user_id,
  });

  if (!allowed) {
    return { response: NextResponse.json({ ok: false, message: "본인이 작성한 글만 변경할 수 있습니다." }, { status: 403 }) };
  }

  return { post };
}

export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;

  try {
    const context = await getBoardMutationContext(id);
    if ("response" in context) return context.response;

    const body = (await req.json().catch(() => ({}))) as Record<string, unknown>;
    const input = normalizeBoardPostUpdateInput(body);
    const validationMessage = validateBoardPostUpdateInput(input);
    if (validationMessage) {
      return NextResponse.json({ ok: false, message: validationMessage }, { status: 400 });
    }

    const previousImageUrl = context.post.image_url;
    const post = await updateBoardPostById(id, input);

    if (previousImageUrl && previousImageUrl !== post.image_url) {
      try {
        await deleteBoardImageFromR2(previousImageUrl);
      } catch (error) {
        console.warn("[board] R2 image delete failed after post edit", {
          postId: id,
          imageUrl: previousImageUrl,
          error,
        });
      }
    }

    revalidatePath("/board");
    revalidatePath(`/board/${id}`);
    revalidatePath(`/board/${id}/edit`);

    return NextResponse.json({ ok: true, post });
  } catch (error) {
    if (isBoardStorageMissing(error)) {
      return NextResponse.json({ ok: false, message: "게시판 저장소를 사용할 수 없습니다." }, { status: 503 });
    }

    return NextResponse.json(
      {
        ok: false,
        message: error instanceof Error ? error.message : "게시글을 수정하지 못했습니다.",
      },
      { status: 500 }
    );
  }
}

export async function DELETE(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;

  try {
    const context = await getBoardMutationContext(id);
    if ("response" in context) return context.response;

    await deleteBoardPostById(id);

    let imageDeleted = false;
    try {
      const result = await deleteBoardImageFromR2(context.post.image_url);
      imageDeleted = result.deleted;
    } catch (error) {
      console.warn("[board] R2 image delete failed after post delete", {
        postId: id,
        imageUrl: context.post.image_url,
        error,
      });
    }

    revalidatePath("/board");
    revalidatePath(`/board/${id}`);

    return NextResponse.json({ ok: true, deleted: { post: true, image: imageDeleted } });
  } catch (error) {
    if (isBoardStorageMissing(error)) {
      return NextResponse.json({ ok: false, message: "게시판 저장소를 사용할 수 없습니다." }, { status: 503 });
    }

    return NextResponse.json(
      {
        ok: false,
        message: error instanceof Error ? error.message : "게시글을 삭제하지 못했습니다.",
      },
      { status: 500 }
    );
  }
}
