import { revalidatePath } from "next/cache";
import { cookies } from "next/headers";
import { NextResponse } from "next/server";

import { ADMIN_SESSION_COOKIE, isValidAdminSession } from "@/lib/admin-auth";
import {
  createAdminSchedulePost,
  isScheduleInfoStorageMissing,
  listAdminScheduleInfoPosts,
  normalizeAdminSchedulePostInput,
  validateAdminSchedulePostInput,
} from "@/lib/board";

export const runtime = "nodejs";

async function requireAdmin() {
  const cookieStore = await cookies();
  return isValidAdminSession(cookieStore.get(ADMIN_SESSION_COOKIE)?.value);
}

export async function GET() {
  if (!(await requireAdmin())) {
    return NextResponse.json({ ok: false, message: "unauthorized" }, { status: 401 });
  }

  try {
    const result = await listAdminScheduleInfoPosts(100);
    return NextResponse.json({ ok: true, posts: result.posts });
  } catch (error) {
    if (isScheduleInfoStorageMissing(error)) {
      return NextResponse.json({ ok: false, message: "board_posts storage is not ready" }, { status: 503 });
    }

    return NextResponse.json(
      { ok: false, message: error instanceof Error ? error.message : "failed to load schedule posts" },
      { status: 500 }
    );
  }
}

export async function POST(req: Request) {
  if (!(await requireAdmin())) {
    return NextResponse.json({ ok: false, message: "unauthorized" }, { status: 401 });
  }

  try {
    const body = (await req.json().catch(() => ({}))) as Record<string, unknown>;
    const input = normalizeAdminSchedulePostInput(body);
    const validationMessage = validateAdminSchedulePostInput(input, body);

    if (validationMessage) {
      return NextResponse.json({ ok: false, message: validationMessage }, { status: 400 });
    }

    const post = await createAdminSchedulePost(input);
    revalidatePath("/board");
    revalidatePath("/schedule");

    return NextResponse.json({ ok: true, post }, { status: 201 });
  } catch (error) {
    if (isScheduleInfoStorageMissing(error)) {
      return NextResponse.json({ ok: false, message: "board_posts storage is not ready" }, { status: 503 });
    }

    return NextResponse.json(
      { ok: false, message: error instanceof Error ? error.message : "failed to create schedule post" },
      { status: 500 }
    );
  }
}
