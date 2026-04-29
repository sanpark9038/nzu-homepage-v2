import { createSupabaseAdminClient } from "@/lib/supabase-admin";
import { supabase as publicSupabase } from "@/lib/supabase";
import type { Database } from "@/lib/database.types";

export type BoardPostRow = Database["public"]["Tables"]["board_posts"]["Row"];
export type BoardPostInsert = Database["public"]["Tables"]["board_posts"]["Insert"];
export type BoardCategory = "notice" | "schedule" | null;

const BOARD_POST_LIMIT = 20;
const IMAGE_URL_EXTENSIONS = new Set([".gif", ".jpeg", ".jpg", ".png", ".webp"]);
const SOOP_VIDEO_HOSTS = ["sooplive.com", "sooplive.co.kr"];

function normalizeText(value: unknown) {
  return String(value || "").trim();
}

function normalizeOptionalUrl(value: unknown) {
  const text = normalizeText(value);
  if (!text) return null;

  try {
    const url = new URL(text);
    if (!["http:", "https:"].includes(url.protocol)) return null;
    return url.toString();
  } catch {
    return null;
  }
}

function normalizeOptionalImageUrl(value: unknown) {
  const url = normalizeOptionalUrl(value);
  if (!url) return null;

  try {
    const parsedUrl = new URL(url);
    const pathname = parsedUrl.pathname.toLowerCase();
    const hasImageExtension = Array.from(IMAGE_URL_EXTENSIONS).some((extension) => pathname.endsWith(extension));
    return hasImageExtension ? parsedUrl.toString() : null;
  } catch {
    return null;
  }
}

function normalizeOptionalVideoUrl(value: unknown) {
  const url = normalizeOptionalUrl(value);
  if (!url) return null;
  return buildVideoEmbedUrl(url) ? url : null;
}

function isAllowedSoopVideoHost(hostname: string) {
  const normalizedHostname = hostname.toLowerCase();
  return SOOP_VIDEO_HOSTS.some(
    (allowedHost) => normalizedHostname === allowedHost || normalizedHostname.endsWith(`.${allowedHost}`)
  );
}

function normalizeCategory(value: unknown): BoardCategory {
  const text = normalizeText(value).toLowerCase();
  if (text === "notice") return "notice";
  if (text === "schedule") return "schedule";
  return null;
}

export function normalizeBoardPostInput(value: unknown) {
  const row = (value || {}) as Partial<BoardPostInsert>;
  const title = normalizeText(row.title).slice(0, 120);
  const content = normalizeText(row.content).slice(0, 4000);
  const authorName = normalizeText(row.author_name).slice(0, 40);

  return {
    title,
    content,
    author_name: authorName,
    author_provider: normalizeText(row.author_provider) || null,
    author_provider_user_id: normalizeText(row.author_provider_user_id) || null,
    category: normalizeCategory(row.category),
    image_url: normalizeOptionalImageUrl(row.image_url),
    video_url: normalizeOptionalVideoUrl(row.video_url),
    download_url: normalizeOptionalUrl(row.download_url),
    published: true,
  } satisfies BoardPostInsert;
}

export function validateBoardPostInput(input: ReturnType<typeof normalizeBoardPostInput>) {
  if (!input.author_name) return "작성자 이름을 입력해 주세요.";
  if (!input.title) return "제목을 입력해 주세요.";
  if (!input.content) return "내용을 입력해 주세요.";
  if (input.title.length < 2) return "제목은 2자 이상 입력해 주세요.";
  return null;
}

export function isBoardStorageMissing(error: unknown) {
  const message = error instanceof Error ? error.message : String(error || "");
  return /board_posts|relation|schema cache|42p01/i.test(message);
}

export function isBoardReadUnavailable(error: unknown) {
  const message = error instanceof Error ? error.message : String(error || "");
  return /fetch failed|eacces|failed to fetch|network|timeout/i.test(message);
}

export function isYoutubeUrl(value: string | null | undefined) {
  const text = normalizeText(value);
  if (!text) return false;
  try {
    const url = new URL(text);
    return ["youtube.com", "www.youtube.com", "youtu.be", "m.youtube.com"].includes(url.hostname);
  } catch {
    return false;
  }
}

export function buildVideoEmbedUrl(value: string | null | undefined) {
  const text = normalizeText(value);
  if (!text) return null;

  try {
    const url = new URL(text);

    if (["youtube.com", "www.youtube.com", "m.youtube.com"].includes(url.hostname)) {
      if (url.pathname.startsWith("/embed/")) return url.toString();
      const videoId = url.searchParams.get("v");
      if (!videoId) return null;
      return `https://www.youtube.com/embed/${videoId}`;
    }

    if (url.hostname === "youtu.be") {
      const videoId = url.pathname.replace(/^\/+/, "");
      if (!videoId) return null;
      return `https://www.youtube.com/embed/${videoId}`;
    }

    if (isAllowedSoopVideoHost(url.hostname)) {
      return url.toString();
    }

    return null;
  } catch {
    return null;
  }
}

export function getBoardCategoryLabel(category: string | null | undefined) {
  if (category === "notice") return "공지";
  if (category === "schedule") return "일정";
  return "";
}

export function getBoardCategoryTone(category: string | null | undefined) {
  if (category === "notice") return "text-rose-300";
  if (category === "schedule") return "text-sky-300";
  return "text-white/30";
}

export function hasBoardMedia(post: Pick<BoardPostRow, "image_url" | "video_url">) {
  return {
    hasImage: Boolean(post.image_url),
    hasVideo: Boolean(buildVideoEmbedUrl(post.video_url)),
  };
}

export async function listBoardPosts(limit = BOARD_POST_LIMIT) {
  try {
    const { data, error } = await publicSupabase
      .from("board_posts")
      .select("*")
      .eq("published", true)
      .order("created_at", { ascending: false })
      .limit(limit);

    if (error) throw error;

    return {
      ok: true as const,
      posts: (data || []) as BoardPostRow[],
      storageReady: true,
    };
  } catch (error) {
    if (isBoardStorageMissing(error) || isBoardReadUnavailable(error)) {
      return {
        ok: true as const,
        posts: [] as BoardPostRow[],
        storageReady: false,
      };
    }
    throw error;
  }
}

export async function getBoardPostById(id: string) {
  const { data, error } = await publicSupabase
    .from("board_posts")
    .select("*")
    .eq("id", id)
    .eq("published", true)
    .maybeSingle();

  if (error) throw error;
  return (data || null) as BoardPostRow | null;
}

export async function createBoardPost(input: ReturnType<typeof normalizeBoardPostInput>) {
  const supabase = createSupabaseAdminClient();
  const { data, error } = await supabase
    .from("board_posts")
    .insert(input)
    .select("*")
    .single();

  if (error) throw error;
  return data as BoardPostRow;
}
