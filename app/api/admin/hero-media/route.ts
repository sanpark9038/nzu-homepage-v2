import { revalidatePath } from "next/cache";
import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { ADMIN_SESSION_COOKIE, assertValidAdminSession } from "@/lib/admin-auth";
import {
  buildHeroMediaObjectPath,
  extractHeroMediaObjectPath,
  HERO_MEDIA_BUCKET,
  inferHeroMediaTypeFromFilename,
} from "@/lib/hero-media";
import { createSupabaseAdminClient } from "@/lib/supabase-admin";

export const runtime = "nodejs";

async function requireAdmin() {
  const cookieStore = await cookies();
  assertValidAdminSession(cookieStore.get(ADMIN_SESSION_COOKIE)?.value);
}

async function listHeroMedia() {
  const supabase = createSupabaseAdminClient();
  const { data, error } = await supabase
    .from("hero_media")
    .select("id, url, type, is_active, created_at")
    .order("is_active", { ascending: false })
    .order("created_at", { ascending: false });

  if (error) throw error;
  return data || [];
}

export async function GET() {
  try {
    await requireAdmin();
    const media = await listHeroMedia();
    return NextResponse.json({ ok: true, media });
  } catch (error) {
    const status =
      error instanceof Error && error.message === "unauthorized"
        ? 401
        : error instanceof Error && error.message === "missing_supabase_admin_env"
          ? 500
          : 500;
    return NextResponse.json(
      {
        ok: false,
        message:
          status === 401
            ? "unauthorized"
            : status === 500 && error instanceof Error && error.message === "missing_supabase_admin_env"
              ? "Supabase 관리자 환경변수가 없습니다."
              : "히어로 미디어를 불러오지 못했습니다.",
      },
      { status }
    );
  }
}

export async function POST(req: Request) {
  try {
    await requireAdmin();
    const formData = await req.formData();
    const file = formData.get("file");
    const activate = String(formData.get("activate") || "").trim() === "true";

    if (!(file instanceof File)) {
      return NextResponse.json({ ok: false, message: "업로드할 파일이 필요합니다." }, { status: 400 });
    }

    const inferredType = inferHeroMediaTypeFromFilename(file.name, file.type);
    if (!inferredType) {
      return NextResponse.json({ ok: false, message: "지원하지 않는 파일 형식입니다." }, { status: 400 });
    }

    const supabase = createSupabaseAdminClient();
    const objectPath = buildHeroMediaObjectPath(file.name);
    const buffer = Buffer.from(await file.arrayBuffer());

    const { error: uploadError } = await supabase.storage.from(HERO_MEDIA_BUCKET).upload(objectPath, buffer, {
      contentType: file.type || undefined,
      upsert: false,
    });

    if (uploadError) {
      throw new Error(uploadError.message || "storage_upload_failed");
    }

    const {
      data: { publicUrl },
    } = supabase.storage.from(HERO_MEDIA_BUCKET).getPublicUrl(objectPath);

    if (activate) {
      const { error: clearError } = await supabase.from("hero_media").update({ is_active: false }).eq("is_active", true);
      if (clearError) throw clearError;
    }

    const { error: insertError } = await supabase.from("hero_media").insert({
      url: publicUrl,
      type: inferredType,
      is_active: activate,
    });

    if (insertError) {
      await supabase.storage.from(HERO_MEDIA_BUCKET).remove([objectPath]);
      throw new Error(insertError.message || "hero_media_insert_failed");
    }

    revalidatePath("/");
    revalidatePath("/admin/hero-media");
    const media = await listHeroMedia();
    return NextResponse.json({ ok: true, media });
  } catch (error) {
    const status = error instanceof Error && error.message === "unauthorized" ? 401 : 500;
    return NextResponse.json(
      {
        ok: false,
        message:
          status === 401
            ? "unauthorized"
            : error instanceof Error && error.message
              ? error.message
              : "히어로 미디어 업로드에 실패했습니다.",
      },
      { status }
    );
  }
}

export async function PATCH(req: Request) {
  try {
    await requireAdmin();
    const body = (await req.json().catch(() => ({}))) as { id?: string; is_active?: boolean };
    const id = String(body.id || "").trim();

    if (!id) {
      return NextResponse.json({ ok: false, message: "대상 id가 필요합니다." }, { status: 400 });
    }

    const supabase = createSupabaseAdminClient();
    const nextActive = Boolean(body.is_active);

    if (nextActive) {
      const { error: clearError } = await supabase.from("hero_media").update({ is_active: false }).eq("is_active", true);
      if (clearError) throw clearError;
    }

    const { error: updateError } = await supabase.from("hero_media").update({ is_active: nextActive }).eq("id", id);
    if (updateError) throw updateError;

    revalidatePath("/");
    revalidatePath("/admin/hero-media");
    const media = await listHeroMedia();
    return NextResponse.json({ ok: true, media });
  } catch (error) {
    const status = error instanceof Error && error.message === "unauthorized" ? 401 : 500;
    return NextResponse.json(
      { ok: false, message: status === 401 ? "unauthorized" : "히어로 미디어 변경에 실패했습니다." },
      { status }
    );
  }
}

export async function DELETE(req: Request) {
  try {
    await requireAdmin();
    const requestUrl = new URL(req.url);
    const id = String(requestUrl.searchParams.get("id") || "").trim();

    if (!id) {
      return NextResponse.json({ ok: false, message: "대상 id가 필요합니다." }, { status: 400 });
    }

    const supabase = createSupabaseAdminClient();
    const { data: row, error: rowError } = await supabase
      .from("hero_media")
      .select("id, url")
      .eq("id", id)
      .maybeSingle();

    if (rowError) throw rowError;
    if (!row) {
      return NextResponse.json({ ok: false, message: "삭제할 히어로 미디어를 찾지 못했습니다." }, { status: 404 });
    }

    const objectPath = extractHeroMediaObjectPath(row.url);
    if (objectPath) {
      const { error: removeError } = await supabase.storage.from(HERO_MEDIA_BUCKET).remove([objectPath]);
      if (removeError && !String(removeError.message || "").toLowerCase().includes("not found")) {
        throw new Error(removeError.message || "failed to delete storage object");
      }
    }

    const { error: deleteRowError } = await supabase.from("hero_media").delete().eq("id", id);
    if (deleteRowError) throw deleteRowError;

    revalidatePath("/");
    revalidatePath("/admin/hero-media");
    const media = await listHeroMedia();
    return NextResponse.json({ ok: true, media });
  } catch (error) {
    const status = error instanceof Error && error.message === "unauthorized" ? 401 : 500;
    return NextResponse.json(
      {
        ok: false,
        message:
          status === 401
            ? "unauthorized"
            : error instanceof Error && error.message
              ? error.message
              : "히어로 미디어 삭제에 실패했습니다.",
      },
      { status }
    );
  }
}
