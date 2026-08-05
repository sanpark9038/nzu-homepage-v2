import { supabase } from "@/lib/supabase";
import { Tables } from "@/lib/database.types";

export const HERO_MEDIA_BUCKET = "hero-media";
export const HERO_MEDIA_IMAGE_EXTENSIONS = ["jpg", "jpeg", "png", "webp"] as const;
export const HERO_MEDIA_VIDEO_EXTENSIONS = ["mp4", "webm"] as const;
export const HERO_MEDIA_ALLOWED_EXTENSIONS = [
  ...HERO_MEDIA_IMAGE_EXTENSIONS,
  ...HERO_MEDIA_VIDEO_EXTENSIONS,
] as const;

export type HeroMediaRow = Tables<"hero_media">;
export type HeroMediaType = "image" | "video";

function normalizeExtension(value: string) {
  return String(value || "")
    .trim()
    .toLowerCase()
    .replace(/^\./, "");
}

export function inferHeroMediaType(value: string, fallback?: string | null): HeroMediaType | null {
  const normalized = normalizeExtension(value || fallback || "");
  if (!normalized) return null;
  if (HERO_MEDIA_IMAGE_EXTENSIONS.includes(normalized as (typeof HERO_MEDIA_IMAGE_EXTENSIONS)[number])) {
    return "image";
  }
  if (HERO_MEDIA_VIDEO_EXTENSIONS.includes(normalized as (typeof HERO_MEDIA_VIDEO_EXTENSIONS)[number])) {
    return "video";
  }
  return null;
}

export function inferHeroMediaTypeFromFilename(filename: string, mimeType?: string | null): HeroMediaType | null {
  const mime = String(mimeType || "").toLowerCase();
  if (mime.startsWith("image/")) return "image";
  if (mime.startsWith("video/")) return "video";

  const extension = filename.includes(".") ? filename.split(".").pop() || "" : "";
  return inferHeroMediaType(extension);
}

export function sanitizeHeroMediaType(value: unknown): HeroMediaType {
  const normalized = String(value || "").trim().toLowerCase();
  if (normalized === "video") return "video";
  return "image";
}

export function buildHeroMediaObjectPath(filename: string) {
  const safeName = String(filename || "hero-media")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9._-]+/g, "-")
    .replace(/^-+|-+$/g, "");

  const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
  return `hero/${timestamp}-${safeName || "hero-media"}`;
}

export function extractHeroMediaObjectPath(url: string) {
  try {
    const parsed = new URL(String(url || ""));
    const marker = `/${HERO_MEDIA_BUCKET}/`;
    const markerIndex = parsed.pathname.indexOf(marker);
    if (markerIndex < 0) return null;
    return decodeURIComponent(parsed.pathname.slice(markerIndex + marker.length));
  } catch {
    return null;
  }
}

export const DEFAULT_HERO_TITLE = "오늘은\n당신입니다";

export async function getHeroTitle(): Promise<string> {
  const { data, error } = await supabase
    .from("site_settings")
    .select("value")
    .eq("key", "hero_title")
    .maybeSingle();

  if (error) {
    if (error.code === "PGRST205") {
      return DEFAULT_HERO_TITLE;
    }
    console.error("failed to load hero title", error);
    return DEFAULT_HERO_TITLE;
  }

  const value = data?.value?.trim();
  return value ? value : DEFAULT_HERO_TITLE;
}

/** 홈 첫 화면에 무엇을 띄울지. site_settings.hero_mode */
export type HeroMode = "image" | "video" | "deck";

/**
 * 셋 중 하나가 아니면 null — 호출부는 "설정된 적 없음"으로 다룬다.
 * 값을 쓰는 곳이 관리자 API 하나뿐이라 대소문자 관용은 두지 않는다. 모르는 값이면 기존 동작으로 떨어지는 게 안전하다.
 */
export function sanitizeHeroMode(value: unknown): HeroMode | null {
  const normalized = typeof value === "string" ? value.trim() : "";
  return normalized === "image" || normalized === "video" || normalized === "deck" ? normalized : null;
}

/** site_settings.hero_mode. 키가 없거나 읽기에 실패하면 null(= 지금까지의 동작 그대로) */
export async function getHeroMode(): Promise<HeroMode | null> {
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
}

/**
 * type이 없으면 지금까지처럼 활성 한 줄만 본다 — 모드 키가 없던 홈이 그대로 동작한다.
 * type이 있으면 그 타입 안에서 활성 → 최신 순으로 하나 고른다.
 */
export async function getActiveHeroMedia(type?: HeroMediaType): Promise<HeroMediaRow | null> {
  const columns = supabase.from("hero_media").select("id, url, type, is_active, created_at");
  const { data, error } = await (type
    ? columns.eq("type", type).order("is_active", { ascending: false })
    : columns.eq("is_active", true))
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error) {
    if (error.code === "PGRST205") {
      return null;
    }
    console.error("failed to load active hero media", error);
    return null;
  }

  return data;
}
