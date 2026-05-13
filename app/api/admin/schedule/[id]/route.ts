import { revalidatePath } from "next/cache";
import { cookies } from "next/headers";
import { NextResponse } from "next/server";

import { ADMIN_SESSION_COOKIE, isValidAdminSession } from "@/lib/admin-auth";
import {
  deleteBoardPostById,
  getBoardPostForMutation,
  isScheduleInfoStorageMissing,
  normalizeAdminSchedulePostUpdateInput,
  updateAdminSchedulePostById,
  validateAdminSchedulePostInput,
} from "@/lib/board";
import { deleteBoardImageFromR2 } from "@/lib/r2";

export const runtime = "nodejs";

async function requireAdmin() {
  const cookieStore = await cookies();
  return isValidAdminSession(cookieStore.get(ADMIN_SESSION_COOKIE)?.value);
}

export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  if (!(await requireAdmin())) {
    return NextResponse.json({ ok: false, message: "unauthorized" }, { status: 401 });
  }

  const { id } = await params;

  try {
    const body = (await req.json().catch(() => ({}))) as Record<string, unknown>;
    const input = normalizeAdminSchedulePostUpdateInput(body);
    const validationMessage = validateAdminSchedulePostInput(input, body);
    if (validationMessage) {
      return NextResponse.json({ ok: false, message: validationMessage }, { status: 400 });
    }

    const previousPost = await getBoardPostForMutation(id);
    if (!previousPost || previousPost.category !== "schedule") {
      return NextResponse.json({ ok: false, message: "schedule post not found" }, { status: 404 });
    }
    const previousImageUrl = previousPost.image_url;
    const post = await updateAdminSchedulePostById(id, input);

    if (previousImageUrl && previousImageUrl !== post.image_url) {
      try {
        await deleteBoardImageFromR2(previousImageUrl);
      } catch (deleteError) {
        console.warn("[schedule] R2 image delete failed after schedule edit", { postId: id, deleteError });
      }
    }

    revalidatePath("/board");
    revalidatePath(`/board/${id}`);
    revalidatePath("/schedule");

    return NextResponse.json({ ok: true, post });
  } catch (error) {
    if (isScheduleInfoStorageMissing(error)) {
      return NextResponse.json({ ok: false, message: "board_posts storage is not ready" }, { status: 503 });
    }
    return NextResponse.json(
      { ok: false, message: error instanceof Error ? error.message : "failed to update schedule post" },
      { status: 500 }
    );
  }
}

export async function DELETE(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  if (!(await requireAdmin())) {
    return NextResponse.json({ ok: false, message: "unauthorized" }, { status: 401 });
  }

  const { id } = await params;

  try {
    const post = await getBoardPostForMutation(id);
    if (!post || post.category !== "schedule") {
      return NextResponse.json({ ok: false, message: "schedule post not found" }, { status: 404 });
    }

    await deleteBoardPostById(id);

    if (post.image_url) {
      try {
        await deleteBoardImageFromR2(post.image_url);
      } catch (deleteError) {
        console.warn("[schedule] R2 image delete failed after schedule delete", { postId: id, deleteError });
      }
    }

    revalidatePath("/board");
    revalidatePath(`/board/${id}`);
    revalidatePath("/schedule");

    return NextResponse.json({ ok: true, deleted: { post: true } });
  } catch (error) {
    if (isScheduleInfoStorageMissing(error)) {
      return NextResponse.json({ ok: false, message: "board_posts storage is not ready" }, { status: 503 });
    }
    return NextResponse.json(
      { ok: false, message: error instanceof Error ? error.message : "failed to delete schedule post" },
      { status: 500 }
    );
  }
}
