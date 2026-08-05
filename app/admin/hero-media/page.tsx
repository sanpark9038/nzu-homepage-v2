import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { AdminNav } from "@/components/admin/AdminNav";
import { ADMIN_SESSION_COOKIE, isValidAdminSession } from "@/lib/admin-auth";
import { createSupabaseAdminClient } from "@/lib/supabase-admin";
import { DEFAULT_HERO_TITLE, sanitizeHeroMode, type HeroMode } from "@/lib/hero-media";
import LogoutButton from "../ops/LogoutButton";
import HeroMediaAdmin from "./HeroMediaAdmin";

export const dynamic = "force-dynamic";

async function loadHeroMedia() {
  try {
    const supabase = createSupabaseAdminClient();
    const { data, error } = await supabase
      .from("hero_media")
      .select("id, url, type, is_active, created_at")
      .order("is_active", { ascending: false })
      .order("created_at", { ascending: false });

    if (error) {
      console.error("failed to load hero media", error);
      return [];
    }

    return data || [];
  } catch (error) {
    console.error("failed to initialize hero media admin", error);
    return [];
  }
}

async function loadHeroTitle() {
  try {
    const supabase = createSupabaseAdminClient();
    const { data, error } = await supabase
      .from("site_settings")
      .select("value")
      .eq("key", "hero_title")
      .maybeSingle();

    if (error) {
      if (error.code !== "PGRST205") console.error("failed to load hero title", error);
      return DEFAULT_HERO_TITLE;
    }

    const value = data?.value?.trim();
    return value ? value : DEFAULT_HERO_TITLE;
  } catch (error) {
    console.error("failed to initialize hero title", error);
    return DEFAULT_HERO_TITLE;
  }
}

/** 아직 고른 적이 없으면 null — 화면은 "설정하지 않음"으로 그린다 */
async function loadHeroMode(): Promise<HeroMode | null> {
  try {
    const supabase = createSupabaseAdminClient();
    const { data, error } = await supabase
      .from("site_settings")
      .select("value")
      .eq("key", "hero_mode")
      .maybeSingle();

    if (error) {
      if (error.code !== "PGRST205") console.error("failed to load hero mode", error);
      return null;
    }

    return sanitizeHeroMode(data?.value);
  } catch (error) {
    console.error("failed to initialize hero mode", error);
    return null;
  }
}

export default async function AdminHeroMediaPage() {
  const cookieStore = await cookies();
  const sessionValue = cookieStore.get(ADMIN_SESSION_COOKIE)?.value;

  if (!isValidAdminSession(sessionValue)) {
    redirect("/admin/login?next=/admin/hero-media");
  }

  const [initialMedia, initialTitle, initialMode] = await Promise.all([
    loadHeroMedia(),
    loadHeroTitle(),
    loadHeroMode(),
  ]);

  return (
    <main className="min-h-screen bg-background p-6 text-foreground md:p-10">
      <div className="mx-auto flex max-w-6xl flex-col gap-6">
        <div className="flex items-center justify-between">
          <AdminNav />
          <LogoutButton />
        </div>

        <div className="space-y-2">
          <h1 className="text-3xl font-black tracking-tight text-white">히어로 미디어 관리</h1>
          <p className="text-sm text-white/55">
            메인 페이지 첫 화면을 채우는 대표 이미지와 영상을 업로드하고, 어떤 항목을 노출할지 바로 바꿀 수 있습니다.
          </p>
        </div>

        <HeroMediaAdmin initialMedia={initialMedia} initialTitle={initialTitle} initialMode={initialMode} />
      </div>
    </main>
  );
}
