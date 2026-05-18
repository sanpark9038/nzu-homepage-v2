import { createSupabaseAdminClient } from "@/lib/supabase-admin";
import { supabase as publicSupabase } from "@/lib/supabase";
import type { Database } from "@/lib/database.types";

export type BoardCommentRow = Database["public"]["Tables"]["board_comments"]["Row"];
export type BoardCommentInsert = Database["public"]["Tables"]["board_comments"]["Insert"];

export const BOARD_COMMENT_MAX_LENGTH = 300;
export const BOARD_COMMENT_RATE_LIMIT_SECONDS = 30;

function normalizeText(value: unknown) {
  return String(value || "").trim();
}

function formatErrorSearchText(error: unknown) {
  if (error instanceof Error) return error.message;
  if (!error || typeof error !== "object") return String(error || "");
  try {
    return JSON.stringify(error);
  } catch {
    return String(error || "");
  }
}

export function isBoardCommentsStorageMissing(error: unknown) {
  const message = formatErrorSearchText(error);
  return /board_comments|relation|schema cache|42p01|42703/i.test(message);
}

export function normalizeBoardCommentInput(value: unknown) {
  const row = (value || {}) as Partial<BoardCommentInsert>;
  return {
    content: normalizeText(row.content).slice(0, BOARD_COMMENT_MAX_LENGTH),
  };
}

export function validateBoardCommentInput(input: ReturnType<typeof normalizeBoardCommentInput>) {
  if (!input.content) return "댓글 내용을 입력해 주세요.";
  if (input.content.length > BOARD_COMMENT_MAX_LENGTH) return "댓글은 300자까지 입력할 수 있습니다.";
  return null;
}

export function buildBoardCommentAuthorId(provider: string, providerUserId: string) {
  return `${normalizeText(provider)}:${normalizeText(providerUserId)}`;
}

export function canDeleteBoardComment({
  isAdmin,
  authorId,
  currentAuthorId,
}: {
  isAdmin: boolean;
  authorId: string | null;
  currentAuthorId: string | null;
}) {
  if (isAdmin) return true;
  if (!authorId || !currentAuthorId) return false;
  return authorId === currentAuthorId;
}

export async function listVisibleBoardComments(postId: string) {
  try {
    const { data, error } = await publicSupabase
      .from("board_comments")
      .select("*")
      .eq("post_id", postId)
      .is("deleted_at", null)
      .order("created_at", { ascending: true });

    if (error) throw error;

    return {
      ok: true as const,
      comments: (data || []) as BoardCommentRow[],
      storageReady: true,
    };
  } catch (error) {
    if (isBoardCommentsStorageMissing(error)) {
      return { ok: true as const, comments: [] as BoardCommentRow[], storageReady: false };
    }
    throw error;
  }
}

export async function getVisibleBoardCommentCounts(postIds: string[]) {
  const uniqueIds = [...new Set(postIds.map(normalizeText).filter(Boolean))];
  if (!uniqueIds.length) return new Map<string, number>();

  try {
    const { data, error } = await publicSupabase
      .from("board_comments")
      .select("post_id")
      .in("post_id", uniqueIds)
      .is("deleted_at", null);

    if (error) throw error;

    const counts = new Map<string, number>();
    for (const row of data || []) {
      const postId = normalizeText((row as { post_id?: string }).post_id);
      if (postId) counts.set(postId, Number(counts.get(postId) || 0) + 1);
    }
    return counts;
  } catch (error) {
    if (isBoardCommentsStorageMissing(error)) return new Map<string, number>();
    throw error;
  }
}

export async function assertBoardCommentRateLimit(authorId: string, now = new Date()) {
  const supabase = createSupabaseAdminClient();
  const threshold = new Date(now.getTime() - BOARD_COMMENT_RATE_LIMIT_SECONDS * 1000).toISOString();
  const { data, error } = await supabase
    .from("board_comments")
    .select("id, created_at")
    .eq("author_id", authorId)
    .gte("created_at", threshold)
    .order("created_at", { ascending: false })
    .limit(1);

  if (error) throw error;
  if ((data || []).length > 0) {
    const rateLimitError = new Error("board_comment_rate_limited");
    rateLimitError.name = "BoardCommentRateLimitError";
    throw rateLimitError;
  }
}

export async function createBoardComment(input: {
  postId: string;
  authorId: string;
  authorName: string;
  content: string;
}) {
  const supabase = createSupabaseAdminClient();
  const { data, error } = await supabase
    .from("board_comments")
    .insert({
      post_id: input.postId,
      author_id: input.authorId,
      author_name: input.authorName,
      content: input.content,
    })
    .select("*")
    .single();

  if (error) throw error;
  return data as BoardCommentRow;
}

export async function getBoardCommentForMutation(commentId: string) {
  const supabase = createSupabaseAdminClient();
  const { data, error } = await supabase
    .from("board_comments")
    .select("*")
    .eq("id", commentId)
    .maybeSingle();

  if (error) throw error;
  return (data || null) as BoardCommentRow | null;
}

export async function softDeleteBoardComment(commentId: string, deletedBy: string) {
  const supabase = createSupabaseAdminClient();
  const { data, error } = await supabase
    .from("board_comments")
    .update({
      deleted_at: new Date().toISOString(),
      deleted_by: deletedBy,
    })
    .eq("id", commentId)
    .is("deleted_at", null)
    .select("*")
    .single();

  if (error) throw error;
  return data as BoardCommentRow;
}
