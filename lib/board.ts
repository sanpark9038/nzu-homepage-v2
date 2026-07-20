import { unstable_cache } from "next/cache";
import { createSupabaseAdminClient } from "@/lib/supabase-admin";
import { supabase as publicSupabase } from "@/lib/supabase";
import type { Database } from "@/lib/database.types";
import { getVisibleBoardCommentCounts } from "@/lib/board-comments";

export type BoardPostRow = Database["public"]["Tables"]["board_posts"]["Row"];
export type BoardPostInsert = Database["public"]["Tables"]["board_posts"]["Insert"];
export type BoardPostUpdate = Database["public"]["Tables"]["board_posts"]["Update"];
export type BoardCategory = "notice" | "schedule" | null;
export type BoardListFilter = "all" | "schedule" | "past-schedule";

const BOARD_POST_LIMIT = 20;
const BOARD_SCHEDULE_SCAN_LIMIT = 100;
export const BOARD_LIST_CACHE_TAG = "board-list";
const BOARD_LIST_REVALIDATE_SECONDS = 30;
const BOARD_POST_LIST_COLUMNS =
  "id,title,author_name,created_at,category,image_url,video_url,published,schedule_date,schedule_start_time,view_count";
const IMAGE_URL_EXTENSIONS = new Set([".gif", ".jpeg", ".jpg", ".png", ".webp"]);
const SOOP_VIDEO_HOSTS = ["sooplive.com", "sooplive.co.kr"];

function normalizeText(value: unknown) {
  return String(value || "").trim();
}

export function normalizeBoardListFilter(value: unknown): BoardListFilter {
  const text = normalizeText(Array.isArray(value) ? value[0] : value);
  if (text === "schedule") return "schedule";
  if (text === "past-schedule") return "past-schedule";
  return "all";
}

export function normalizeBoardPage(value: unknown): number {
  const n = parseInt(String(Array.isArray(value) ? value[0] : value || ""), 10);
  return Number.isFinite(n) && n > 1 ? n : 1;
}

export function normalizeBoardSearchQuery(value: unknown): string {
  return normalizeText(Array.isArray(value) ? value[0] : value).slice(0, 50);
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

function normalizeOptionalDate(value: unknown) {
  const text = normalizeText(value);
  if (!text) return null;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(text)) return null;

  const date = new Date(`${text}T00:00:00+09:00`);
  if (Number.isNaN(date.getTime())) return null;

  const dateKeyFormatter = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Seoul",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  });
  if (dateKeyFormatter.format(date) !== text) return null;

  return text;
}

function normalizeOptionalTime(value: unknown) {
  const text = normalizeText(value);
  if (!text) return null;
  if (!/^\d{2}:\d{2}$/.test(text)) return null;

  const [hour, minute] = text.split(":").map(Number);
  if (hour < 0 || hour > 23 || minute < 0 || minute > 59) return null;

  return text;
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

export function normalizeBoardPostUpdateInput(value: unknown) {
  const row = (value || {}) as Partial<BoardPostUpdate>;
  const title = normalizeText(row.title).slice(0, 120);
  const content = normalizeText(row.content).slice(0, 4000);

  return {
    title,
    content,
    image_url: normalizeOptionalImageUrl(row.image_url),
    video_url: normalizeOptionalVideoUrl(row.video_url),
  } satisfies Pick<BoardPostUpdate, "title" | "content" | "image_url" | "video_url">;
}

export function normalizeAdminSchedulePostInput(value: unknown) {
  const row = (value || {}) as Partial<BoardPostInsert>;
  const title = normalizeText(row.title).slice(0, 120);
  const content = normalizeText(row.content).slice(0, 4000);
  const displayName = normalizeText(row.schedule_display_name).slice(0, 24);

  return {
    title,
    content,
    author_name: "관리자",
    author_provider: "admin",
    author_provider_user_id: "admin",
    category: "schedule",
    image_url: normalizeOptionalImageUrl(row.image_url),
    video_url: normalizeOptionalVideoUrl(row.video_url),
    download_url: null,
    external_link_url: normalizeOptionalUrl(row.external_link_url),
    schedule_date: normalizeOptionalDate(row.schedule_date),
    schedule_start_time: normalizeOptionalTime(row.schedule_start_time),
    schedule_display_name: displayName || null,
    published: row.published === false ? false : true,
  } satisfies BoardPostInsert;
}

export function normalizeAdminSchedulePostUpdateInput(value: unknown) {
  const row = (value || {}) as Partial<BoardPostUpdate>;
  const title = normalizeText(row.title).slice(0, 120);
  const content = normalizeText(row.content).slice(0, 4000);
  const displayName = normalizeText(row.schedule_display_name).slice(0, 24);

  return {
    title,
    content,
    image_url: normalizeOptionalImageUrl(row.image_url),
    video_url: normalizeOptionalVideoUrl(row.video_url),
    external_link_url: normalizeOptionalUrl(row.external_link_url),
    schedule_date: normalizeOptionalDate(row.schedule_date),
    schedule_start_time: normalizeOptionalTime(row.schedule_start_time),
    schedule_display_name: displayName || null,
    published: row.published === false ? false : true,
  } satisfies Pick<
    BoardPostUpdate,
    | "title"
    | "content"
    | "image_url"
    | "video_url"
    | "external_link_url"
    | "schedule_date"
    | "schedule_start_time"
    | "schedule_display_name"
    | "published"
  >;
}

export function validateBoardPostInput(input: ReturnType<typeof normalizeBoardPostInput>) {
  if (!input.author_name) return "작성자 이름을 입력해 주세요.";
  if (!input.title) return "제목을 입력해 주세요.";
  if (!input.content) return "내용을 입력해 주세요.";
  if (input.title.length < 2) return "제목은 2자 이상 입력해 주세요.";
  return null;
}

export function validateBoardPostUpdateInput(input: ReturnType<typeof normalizeBoardPostUpdateInput>) {
  if (!input.title) return "제목을 입력해 주세요.";
  if (!input.content) return "내용을 입력해 주세요.";
  if (input.title.length < 2) return "제목은 2자 이상 입력해 주세요.";
  return null;
}

function hasInvalidOptionalUrlInput(rawValue: unknown, normalizedValue: string | null) {
  return Boolean(normalizeText(rawValue)) && !normalizedValue;
}

function formatErrorSearchText(error: unknown) {
  if (error instanceof Error) return error.message;
  if (!error || typeof error !== "object") return String(error || "");

  const record = error as Record<string, unknown>;
  const knownParts = ["code", "message", "details", "hint"]
    .map((key) => record[key])
    .filter((value): value is string => typeof value === "string" && value.length > 0);

  try {
    return `${knownParts.join(" ")} ${JSON.stringify(error)}`;
  } catch {
    return knownParts.join(" ");
  }
}

export function validateAdminSchedulePostInput(
  input: ReturnType<typeof normalizeAdminSchedulePostInput> | ReturnType<typeof normalizeAdminSchedulePostUpdateInput>,
  rawValue: unknown = {}
) {
  const raw = (rawValue || {}) as Partial<BoardPostInsert | BoardPostUpdate>;
  if (hasInvalidOptionalUrlInput(raw.external_link_url, input.external_link_url)) {
    return "방송 링크 형식이 올바르지 않습니다.";
  }
  if (!input.title) return "제목을 입력해주세요.";
  if (!input.content) return "본문을 입력해주세요.";
  if (!input.schedule_display_name) return "표시명을 입력해주세요.";
  if (!input.schedule_date) return "일정 날짜를 입력해주세요.";
  return null;
}

export function isBoardStorageMissing(error: unknown) {
  const message = formatErrorSearchText(error);
  return /board_posts|relation|schema cache|42p01/i.test(message);
}

export function isScheduleInfoStorageMissing(error: unknown) {
  const message = formatErrorSearchText(error);
  return (
    isBoardStorageMissing(error) ||
    /schedule_date|schedule_start_time|schedule_display_name|external_link_url|schema cache|42703/i.test(message)
  );
}

export function isBoardReadUnavailable(error: unknown) {
  const message = formatErrorSearchText(error);
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
  if (category === "schedule") return "정보/일정";
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

export type BoardPostListRow = Pick<
  BoardPostRow,
  | "id"
  | "title"
  | "author_name"
  | "created_at"
  | "category"
  | "image_url"
  | "video_url"
  | "published"
  | "schedule_date"
  | "schedule_start_time"
  | "view_count"
>;

function normalizeScheduleTimeForTimestamp(value: string | null | undefined) {
  const match = String(value || "").match(/^(\d{2}):(\d{2})/);
  if (!match) return null;
  const [, hour, minute] = match;
  return `${hour}:${minute}`;
}

function getScheduleExpiryMs(post: Pick<BoardPostListRow, "schedule_date" | "schedule_start_time">) {
  if (!post.schedule_date) return null;

  const time = normalizeScheduleTimeForTimestamp(post.schedule_start_time);
  const startDate = time
    ? new Date(`${post.schedule_date}T${time}:00+09:00`)
    : new Date(`${post.schedule_date}T00:00:00+09:00`);
  const startMs = startDate.getTime();
  if (Number.isNaN(startMs)) return null;

  return startMs + 24 * 60 * 60 * 1000;
}

export function isPastSchedulePost(
  post: Pick<BoardPostListRow, "category" | "schedule_date" | "schedule_start_time">,
  now = new Date()
) {
  if (post.category !== "schedule") return false;
  const expiryMs = getScheduleExpiryMs(post);
  if (expiryMs === null) return false;
  return expiryMs <= now.getTime();
}

async function listBoardSchedulePostSummaries(limit: number, mode: "active" | "past" = "active") {
  try {
    const safeLimit = Math.min(Math.max(limit, 1), BOARD_SCHEDULE_SCAN_LIMIT);
    const { data, error } = await publicSupabase
      .from("board_posts")
      .select(BOARD_POST_LIST_COLUMNS)
      .eq("published", true)
      .eq("category", "schedule")
      .not("schedule_date", "is", null)
      .order("schedule_date", { ascending: false, nullsFirst: false })
      .order("schedule_start_time", { ascending: true, nullsFirst: false })
      .order("created_at", { ascending: false })
      .limit(mode === "past" ? BOARD_SCHEDULE_SCAN_LIMIT : safeLimit);

    if (error) throw error;
    const posts = ((data || []) as BoardPostListRow[]).filter((post) =>
      mode === "past" ? isPastSchedulePost(post) : !isPastSchedulePost(post)
    );

    return {
      ok: true as const,
      posts: posts.slice(0, limit),
      storageReady: true,
    };
  } catch (error) {
    if (isBoardStorageMissing(error) || isBoardReadUnavailable(error)) {
      return {
        ok: true as const,
        posts: [] as BoardPostListRow[],
        storageReady: false,
      };
    }
    throw error;
  }
}

async function listRegularBoardPostSummaries(limit: number, offset = 0) {
  try {
    const { data, error } = await publicSupabase
      .from("board_posts")
      .select(BOARD_POST_LIST_COLUMNS)
      .eq("published", true)
      .or("category.is.null,category.neq.schedule")
      .order("created_at", { ascending: false })
      .range(offset, offset + limit - 1);

    if (error) throw error;

    return {
      ok: true as const,
      posts: (data || []) as BoardPostListRow[],
      storageReady: true,
    };
  } catch (error) {
    if (isBoardStorageMissing(error) || isBoardReadUnavailable(error)) {
      return {
        ok: true as const,
        posts: [] as BoardPostListRow[],
        storageReady: false,
      };
    }
    throw error;
  }
}

async function listBoardPostSummariesFromFullRows(limit: number) {
  const result = await listBoardPosts(Math.max(limit, BOARD_SCHEDULE_SCAN_LIMIT));
  return {
    ok: true as const,
    posts: result.posts
      .filter((post) => !isPastSchedulePost(post))
      .slice(0, limit)
      .map((post) => ({
        id: post.id,
        title: post.title,
        author_name: post.author_name,
        created_at: post.created_at,
        category: post.category,
        image_url: post.image_url,
        video_url: post.video_url,
        published: post.published,
        schedule_date: post.schedule_date,
        schedule_start_time: post.schedule_start_time,
        view_count: post.view_count,
      })),
    storageReady: result.storageReady,
  };
}

export async function listBoardPostSummaries(
  limit = BOARD_POST_LIMIT,
  filter: BoardListFilter = "all",
  page = 1
) {
  const safePage = Math.max(1, page);

  if (filter === "past-schedule") {
    const result = await listBoardSchedulePostSummaries(limit + 1, "past");
    const hasMore = result.posts.length > limit;
    return { ...result, posts: result.posts.slice(0, limit), hasMore };
  }

  if (filter === "schedule") {
    const result = await listBoardSchedulePostSummaries(limit + 1, "active");
    const hasMore = result.posts.length > limit;
    return { ...result, posts: result.posts.slice(0, limit), hasMore };
  }

  // "all" filter: page 1 pins active schedules at top, page 2+ shows only regular posts
  if (safePage === 1) {
    const [scheduleResult, regularResult] = await Promise.all([
      listBoardSchedulePostSummaries(limit, "active"),
      listRegularBoardPostSummaries(limit + 1),
    ]);

    if (!scheduleResult.storageReady || !regularResult.storageReady) {
      const fallback = await listBoardPostSummariesFromFullRows(limit);
      return { ...fallback, hasMore: false };
    }

    const merged = [...scheduleResult.posts, ...regularResult.posts].slice(0, limit);
    const hasMore = regularResult.posts.length > limit;
    return {
      ok: true as const,
      posts: merged,
      storageReady: true,
      hasMore,
    };
  }

  // page 2+: regular posts only, offset by (page - 1) * limit
  const offset = (safePage - 1) * limit;
  const regularResult = await listRegularBoardPostSummaries(limit + 1, offset);

  if (!regularResult.storageReady) {
    const fallback = await listBoardPostSummariesFromFullRows(limit);
    return { ...fallback, hasMore: false };
  }

  const hasMore = regularResult.posts.length > limit;
  return {
    ok: true as const,
    posts: regularResult.posts.slice(0, limit),
    storageReady: true,
    hasMore,
  };
}

export type BoardPostWithCommentCount = BoardPostListRow & {
  comment_count: number;
};

export async function listBoardPostsWithCommentCounts(
  limit = BOARD_POST_LIMIT,
  filter: BoardListFilter = "all",
  page = 1
) {
  const result = await listBoardPostSummaries(limit, filter, page);
  if (!result.posts.length) {
    return {
      ...result,
      posts: [] as BoardPostWithCommentCount[],
      commentsStorageReady: true,
    };
  }

  const counts = await getVisibleBoardCommentCounts(result.posts.map((post) => post.id));
  return {
    ...result,
    posts: result.posts.map((post) => ({
      ...post,
      comment_count: Number(counts.get(post.id) || 0),
    })),
    commentsStorageReady: true,
  };
}

export async function searchBoardPostsWithCommentCounts(
  query: string,
  limit = BOARD_POST_LIMIT,
  page = 1
) {
  const safePage = Math.max(1, page);
  const offset = (safePage - 1) * limit;
  const escaped = query.replace(/[\\%_]/g, (ch) => `\\${ch}`);

  try {
    const { data, error, count } = await publicSupabase
      .from("board_posts")
      .select(BOARD_POST_LIST_COLUMNS, { count: "exact" })
      .eq("published", true)
      .ilike("title", `%${escaped}%`)
      .order("created_at", { ascending: false })
      .range(offset, offset + limit);

    if (error) throw error;

    const rows = (data || []) as BoardPostListRow[];
    const hasMore = rows.length > limit;
    const posts = rows.slice(0, limit);
    const counts = posts.length
      ? await getVisibleBoardCommentCounts(posts.map((post) => post.id))
      : new Map<string, number>();

    return {
      ok: true as const,
      posts: posts.map((post) => ({
        ...post,
        comment_count: Number(counts.get(post.id) || 0),
      })) as BoardPostWithCommentCount[],
      storageReady: true,
      hasMore,
      totalCount: count ?? posts.length,
      commentsStorageReady: true,
    };
  } catch (error) {
    if (isBoardStorageMissing(error) || isBoardReadUnavailable(error)) {
      return {
        ok: true as const,
        posts: [] as BoardPostWithCommentCount[],
        storageReady: false,
        hasMore: false,
        totalCount: 0,
        commentsStorageReady: true,
      };
    }
    throw error;
  }
}

export const getCachedBoardPostsWithCommentCounts = unstable_cache(
  async (limit = BOARD_POST_LIMIT, filter: BoardListFilter = "all", page = 1) =>
    listBoardPostsWithCommentCounts(limit, filter, page),
  ["board-posts-with-comment-counts"],
  {
    revalidate: BOARD_LIST_REVALIDATE_SECONDS,
    tags: [BOARD_LIST_CACHE_TAG],
  }
);

export async function listScheduleInfoPosts(options: { fromDate?: string; toDate?: string; limit?: number } = {}) {
  try {
    const limit = Math.min(Math.max(options.limit || 100, 1), 500);
    let query = publicSupabase
      .from("board_posts")
      .select("*")
      .eq("published", true)
      .eq("category", "schedule")
      .not("schedule_date", "is", null)
      .not("schedule_display_name", "is", null)
      .order("schedule_date", { ascending: true })
      .order("schedule_start_time", { ascending: true, nullsFirst: false })
      .order("created_at", { ascending: true })
      .limit(limit);

    if (options.fromDate) query = query.gte("schedule_date", options.fromDate);
    if (options.toDate) query = query.lte("schedule_date", options.toDate);

    const { data, error } = await query;
    if (error) throw error;

    return {
      ok: true as const,
      posts: (data || []) as BoardPostRow[],
      storageReady: true,
    };
  } catch (error) {
    if (isScheduleInfoStorageMissing(error) || isBoardReadUnavailable(error)) {
      return {
        ok: true as const,
        posts: [] as BoardPostRow[],
        storageReady: false,
      };
    }
    throw error;
  }
}

export async function listAdminScheduleInfoPosts(limit = 100) {
  const safeLimit = Math.min(Math.max(limit, 1), 200);
  const supabase = createSupabaseAdminClient();
  const { data, error } = await supabase
    .from("board_posts")
    .select("*")
    .eq("category", "schedule")
    .order("schedule_date", { ascending: false, nullsFirst: false })
    .order("schedule_start_time", { ascending: true, nullsFirst: false })
    .order("created_at", { ascending: false })
    .limit(safeLimit);

  if (error) throw error;
  return {
    ok: true as const,
    posts: (data || []) as BoardPostRow[],
    storageReady: true,
  };
}

export async function listAdminBoardPosts(limit = 200) {
  const safeLimit = Math.min(Math.max(limit, 1), 500);
  const supabase = createSupabaseAdminClient();
  const { data, error } = await supabase
    .from("board_posts")
    .select("*")
    .order("created_at", { ascending: false })
    .limit(safeLimit);

  if (error) throw error;
  return (data || []) as BoardPostRow[];
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

export type BoardAdjacentPost = Pick<BoardPostRow, "id" | "title">;

export async function getAdjacentBoardPosts(
  currentCreatedAt: string,
  currentId: string
): Promise<{ prev: BoardAdjacentPost | null; next: BoardAdjacentPost | null }> {
  const SELECT = "id,title";

  const [prevResult, nextResult] = await Promise.allSettled([
    publicSupabase
      .from("board_posts")
      .select(SELECT)
      .eq("published", true)
      .or(`created_at.lt.${currentCreatedAt},and(created_at.eq.${currentCreatedAt},id.lt.${currentId})`)
      .order("created_at", { ascending: false })
      .order("id", { ascending: false })
      .limit(1)
      .maybeSingle(),
    publicSupabase
      .from("board_posts")
      .select(SELECT)
      .eq("published", true)
      .or(`created_at.gt.${currentCreatedAt},and(created_at.eq.${currentCreatedAt},id.gt.${currentId})`)
      .order("created_at", { ascending: true })
      .order("id", { ascending: true })
      .limit(1)
      .maybeSingle(),
  ]);

  const prev =
    prevResult.status === "fulfilled" && !prevResult.value.error
      ? (prevResult.value.data as BoardAdjacentPost | null)
      : null;
  const next =
    nextResult.status === "fulfilled" && !nextResult.value.error
      ? (nextResult.value.data as BoardAdjacentPost | null)
      : null;

  return { prev, next };
}

export async function incrementBoardPostView(id: string) {
  try {
    const supabase = createSupabaseAdminClient();
    const { error } = await supabase.rpc("increment_board_post_view", { post_id: id });
    if (error) throw error;
  } catch (error) {
    // 조회수는 부가 정보 — SQL 미적용·일시 장애로 페이지를 깨뜨리지 않는다.
    console.warn("[board] view count increment failed", { postId: id, error });
  }
}

export async function getBoardPostForMutation(id: string) {
  const supabase = createSupabaseAdminClient();
  const { data, error } = await supabase
    .from("board_posts")
    .select("*")
    .eq("id", id)
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

export async function createAdminSchedulePost(input: ReturnType<typeof normalizeAdminSchedulePostInput>) {
  const supabase = createSupabaseAdminClient();
  const { data, error } = await supabase
    .from("board_posts")
    .insert(input)
    .select("*")
    .single();

  if (error) throw error;
  return data as BoardPostRow;
}

export async function updateBoardPostById(id: string, input: ReturnType<typeof normalizeBoardPostUpdateInput>) {
  const supabase = createSupabaseAdminClient();
  const { data, error } = await supabase
    .from("board_posts")
    .update({
      ...input,
      updated_at: new Date().toISOString(),
    })
    .eq("id", id)
    .select("*")
    .single();

  if (error) throw error;
  return data as BoardPostRow;
}

export async function updateAdminSchedulePostById(
  id: string,
  input: ReturnType<typeof normalizeAdminSchedulePostUpdateInput>
) {
  const supabase = createSupabaseAdminClient();
  const { data, error } = await supabase
    .from("board_posts")
    .update({
      ...input,
      updated_at: new Date().toISOString(),
    })
    .eq("id", id)
    .eq("category", "schedule")
    .select("*")
    .single();

  if (error) throw error;
  return data as BoardPostRow;
}

export async function deleteBoardPostById(id: string) {
  const supabase = createSupabaseAdminClient();
  const { error } = await supabase.from("board_posts").delete().eq("id", id);

  if (error) throw error;
}
