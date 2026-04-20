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

export async function getActiveHeroMedia(): Promise<HeroMediaRow | null> {
  const { data, error } = await supabase
    .from("hero_media")
    .select("id, url, type, is_active, created_at")
    .eq("is_active", true)
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
