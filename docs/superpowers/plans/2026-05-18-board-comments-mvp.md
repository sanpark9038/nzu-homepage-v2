# Board Comments MVP Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a lightweight SOOP-login comment MVP to board detail pages, with visible comment counts on the board list.

**Architecture:** Store comments in a dedicated Supabase `board_comments` table and access it only through server API routes. Keep the board post UI resilient when comment storage is not yet applied, and reuse the existing public auth/admin session patterns for write and delete permissions.

**Tech Stack:** Next.js App Router, React client components, Supabase admin client, existing SOOP public auth cookie, Node contract tests.

---

## File Structure

- Create `scripts/sql/create-board-comments.sql`
  - Defines the `board_comments` table, indexes, RLS read policy, and FK to `board_posts`.
- Modify `lib/database.types.ts`
  - Adds the `board_comments` table type so app code can compile without codegen.
- Create `lib/board-comments.ts`
  - Owns normalization, validation, storage-missing detection, list/create/delete/count operations, and permission helpers.
- Create `app/api/board/[id]/comments/route.ts`
  - Handles comment list and create.
- Create `app/api/board/[id]/comments/[commentId]/route.ts`
  - Handles soft delete.
- Create `components/board/BoardComments.tsx`
  - Client component for rendering the list, logged-out state, composer, errors, and delete actions.
- Modify `app/board/[id]/page.tsx`
  - Replaces the existing Coming Soon comment placeholder with the real comment component.
- Modify `lib/board.ts`
  - Adds a helper to attach visible comment counts to board list rows without loading comment bodies.
- Modify `app/board/page.tsx`
  - Renders `[N]` next to the title when `comment_count > 0`.
- Create `scripts/tools/board-comments-contract.test.js`
  - Contract tests for table shape, helper behavior, API routes, UI integration, and board-list count rendering.
- Modify `package.json`
  - Adds `test:board:comments`.

---

### Task 1: Add Contract Coverage First

**Files:**
- Create: `scripts/tools/board-comments-contract.test.js`
- Modify: `package.json`

- [ ] **Step 1: Write the failing contract test**

Create `scripts/tools/board-comments-contract.test.js`:

```js
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const ROOT = path.resolve(__dirname, "..", "..");

function read(relativePath) {
  return fs.readFileSync(path.join(ROOT, relativePath), "utf8");
}

function test(name, fn) {
  try {
    fn();
    console.log(`PASS ${name}`);
  } catch (error) {
    console.error(`FAIL ${name}`);
    throw error;
  }
}

test("board comments SQL creates soft-delete table and visible indexes", () => {
  const sql = read("scripts/sql/create-board-comments.sql");
  assert.match(sql, /create table if not exists public\.board_comments/);
  assert.match(sql, /post_id uuid not null references public\.board_posts\(id\) on delete cascade/);
  assert.match(sql, /content text not null check \(char_length\(content\) <= 300\)/);
  assert.match(sql, /deleted_at timestamptz null/);
  assert.match(sql, /deleted_by text null/);
  assert.match(sql, /board_comments_post_visible_created_idx/);
  assert.match(sql, /where deleted_at is null/);
  assert.match(sql, /enable row level security/);
});

test("board comments helper owns normalization, limits, counts, and permissions", () => {
  const source = read("lib/board-comments.ts");
  assert.match(source, /BOARD_COMMENT_MAX_LENGTH = 300/);
  assert.match(source, /normalizeBoardCommentInput/);
  assert.match(source, /validateBoardCommentInput/);
  assert.match(source, /isBoardCommentsStorageMissing/);
  assert.match(source, /listVisibleBoardComments/);
  assert.match(source, /createBoardComment/);
  assert.match(source, /softDeleteBoardComment/);
  assert.match(source, /getVisibleBoardCommentCounts/);
  assert.match(source, /canDeleteBoardComment/);
  assert.match(source, /deleted_at/);
  assert.match(source, /gte\("created_at"/);
});

test("board comment APIs require session for writes and revalidate board pages", () => {
  const listRoute = read("app/api/board/[id]/comments/route.ts");
  const deleteRoute = read("app/api/board/[id]/comments/[commentId]/route.ts");
  assert.match(listRoute, /export async function GET/);
  assert.match(listRoute, /export async function POST/);
  assert.match(listRoute, /PUBLIC_AUTH_SESSION_COOKIE/);
  assert.match(listRoute, /parsePublicAuthSessionCookieValue/);
  assert.match(listRoute, /댓글을 등록하지 못했습니다/);
  assert.match(listRoute, /잠시 후 다시 작성해 주세요/);
  assert.match(listRoute, /revalidatePath\("\/board"\)/);
  assert.match(listRoute, /revalidatePath\(`\/board\/\$\{id\}`\)/);
  assert.match(deleteRoute, /export async function DELETE/);
  assert.match(deleteRoute, /ADMIN_SESSION_COOKIE/);
  assert.match(deleteRoute, /삭제 권한이 없습니다/);
  assert.match(deleteRoute, /softDeleteBoardComment/);
});

test("board detail renders real comments instead of placeholder", () => {
  const page = read("app/board/[id]/page.tsx");
  assert.match(page, /BoardComments/);
  assert.match(page, /listVisibleBoardComments/);
  assert.doesNotMatch(page, /Coming Soon/);
});

test("board list renders comment counts beside titles", () => {
  const board = read("lib/board.ts");
  const page = read("app/board/page.tsx");
  assert.match(board, /listBoardPostsWithCommentCounts/);
  assert.match(board, /comment_count/);
  assert.match(page, /post\.comment_count > 0/);
  assert.match(page, /\[\{post\.comment_count\}\]/);
});

test("package exposes the board comments contract test", () => {
  const pkg = JSON.parse(read("package.json"));
  assert.equal(pkg.scripts["test:board:comments"], "node scripts/tools/board-comments-contract.test.js");
});
```

- [ ] **Step 2: Add the package script**

Modify `package.json` scripts:

```json
"test:board:comments": "node scripts/tools/board-comments-contract.test.js"
```

- [ ] **Step 3: Run the test and verify it fails for missing implementation**

Run:

```powershell
npm.cmd run test:board:comments
```

Expected: FAIL mentioning missing `scripts/sql/create-board-comments.sql` or missing helper files.

- [ ] **Step 4: Commit the failing contract**

Run:

```powershell
git add scripts/tools/board-comments-contract.test.js package.json
git commit -m "test: add board comments contract"
```

---

### Task 2: Add SQL And Type Definitions

**Files:**
- Create: `scripts/sql/create-board-comments.sql`
- Modify: `lib/database.types.ts`
- Test: `scripts/tools/board-comments-contract.test.js`

- [ ] **Step 1: Add the SQL migration**

Create `scripts/sql/create-board-comments.sql`:

```sql
create extension if not exists pgcrypto;

create table if not exists public.board_comments (
  id uuid primary key default gen_random_uuid(),
  post_id uuid not null references public.board_posts(id) on delete cascade,
  author_id text not null,
  author_name text not null,
  content text not null check (char_length(content) <= 300),
  created_at timestamptz not null default timezone('utc', now()),
  deleted_at timestamptz null,
  deleted_by text null
);

create index if not exists board_comments_post_visible_created_idx
  on public.board_comments (post_id, created_at)
  where deleted_at is null;

create index if not exists board_comments_author_recent_idx
  on public.board_comments (author_id, created_at desc);

alter table public.board_comments enable row level security;

do $$
begin
  if not exists (
    select 1
    from pg_policies
    where schemaname = 'public'
      and tablename = 'board_comments'
      and policyname = 'board_comments_public_read_visible'
  ) then
    create policy board_comments_public_read_visible
      on public.board_comments
      for select
      using (deleted_at is null);
  end if;
end
$$;

comment on table public.board_comments is
  'Public board comments MVP. Writes and soft deletes are performed through server API routes.';
```

- [ ] **Step 2: Add the database type**

Modify `lib/database.types.ts` under `Database["public"]["Tables"]`:

```ts
      board_comments: {
        Row: {
          id: string
          post_id: string
          author_id: string
          author_name: string
          content: string
          created_at: string
          deleted_at: string | null
          deleted_by: string | null
        }
        Insert: {
          id?: string
          post_id: string
          author_id: string
          author_name: string
          content: string
          created_at?: string
          deleted_at?: string | null
          deleted_by?: string | null
        }
        Update: {
          id?: string
          post_id?: string
          author_id?: string
          author_name?: string
          content?: string
          created_at?: string
          deleted_at?: string | null
          deleted_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "board_comments_post_id_fkey"
            columns: ["post_id"]
            isOneToOne: false
            referencedRelation: "board_posts"
            referencedColumns: ["id"]
          },
        ]
      }
```

- [ ] **Step 3: Run the contract and type check**

Run:

```powershell
npm.cmd run test:board:comments
npm.cmd run build
```

Expected: contract still fails for helper/API/UI until later tasks; build should pass if the type edit is syntactically correct.

- [ ] **Step 4: Commit SQL and types**

Run:

```powershell
git add scripts/sql/create-board-comments.sql lib/database.types.ts
git commit -m "feat: add board comments storage schema"
```

---

### Task 3: Implement Comment Domain Helper

**Files:**
- Create: `lib/board-comments.ts`
- Test: `scripts/tools/board-comments-contract.test.js`

- [ ] **Step 1: Create the helper module**

Create `lib/board-comments.ts`:

```ts
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
```

- [ ] **Step 2: Run the focused contract**

Run:

```powershell
npm.cmd run test:board:comments
```

Expected: SQL/helper checks pass; API/UI checks still fail.

- [ ] **Step 3: Run build for type safety**

Run:

```powershell
npm.cmd run build
```

Expected: PASS.

- [ ] **Step 4: Commit the helper**

Run:

```powershell
git add lib/board-comments.ts
git commit -m "feat: add board comment helpers"
```

---

### Task 4: Add Comment API Routes

**Files:**
- Create: `app/api/board/[id]/comments/route.ts`
- Create: `app/api/board/[id]/comments/[commentId]/route.ts`
- Test: `scripts/tools/board-comments-contract.test.js`

- [ ] **Step 1: Add list/create route**

Create `app/api/board/[id]/comments/route.ts`:

```ts
import { cookies } from "next/headers";
import { revalidatePath } from "next/cache";
import { NextResponse } from "next/server";

import {
  assertBoardCommentRateLimit,
  buildBoardCommentAuthorId,
  createBoardComment,
  isBoardCommentsStorageMissing,
  listVisibleBoardComments,
  normalizeBoardCommentInput,
  validateBoardCommentInput,
} from "@/lib/board-comments";
import { getBoardPostForMutation } from "@/lib/board";
import { parsePublicAuthSessionCookieValue, PUBLIC_AUTH_SESSION_COOKIE } from "@/lib/public-auth";

export const runtime = "nodejs";

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  try {
    const result = await listVisibleBoardComments(id);
    return NextResponse.json({ ok: true, ...result });
  } catch {
    return NextResponse.json({ ok: false, message: "댓글을 불러오지 못했습니다." }, { status: 500 });
  }
}

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  try {
    const cookieStore = await cookies();
    const session = parsePublicAuthSessionCookieValue(cookieStore.get(PUBLIC_AUTH_SESSION_COOKIE)?.value);
    if (!session) {
      return NextResponse.json({ ok: false, message: "SOOP 로그인 후 댓글을 작성할 수 있습니다." }, { status: 401 });
    }

    const post = await getBoardPostForMutation(id);
    if (!post || post.published === false) {
      return NextResponse.json({ ok: false, message: "게시글을 찾을 수 없습니다." }, { status: 404 });
    }

    const body = (await req.json().catch(() => ({}))) as Record<string, unknown>;
    const input = normalizeBoardCommentInput(body);
    const validationMessage = validateBoardCommentInput(input);
    if (validationMessage) {
      return NextResponse.json({ ok: false, message: validationMessage }, { status: 400 });
    }

    const authorId = buildBoardCommentAuthorId(session.provider, session.providerUserId);
    await assertBoardCommentRateLimit(authorId);
    const comment = await createBoardComment({
      postId: id,
      authorId,
      authorName: session.displayName,
      content: input.content,
    });

    revalidatePath("/board");
    revalidatePath(`/board/${id}`);
    return NextResponse.json({ ok: true, comment });
  } catch (error) {
    if (error instanceof Error && error.name === "BoardCommentRateLimitError") {
      return NextResponse.json({ ok: false, message: "잠시 후 다시 작성해 주세요." }, { status: 429 });
    }
    if (isBoardCommentsStorageMissing(error)) {
      return NextResponse.json({ ok: false, message: "댓글 기능을 준비 중입니다." }, { status: 503 });
    }
    return NextResponse.json(
      { ok: false, message: "댓글을 등록하지 못했습니다. 잠시 후 다시 시도해 주세요." },
      { status: 500 }
    );
  }
}
```

- [ ] **Step 2: Add soft-delete route**

Create `app/api/board/[id]/comments/[commentId]/route.ts`:

```ts
import { cookies } from "next/headers";
import { revalidatePath } from "next/cache";
import { NextResponse } from "next/server";

import { ADMIN_SESSION_COOKIE, isValidAdminSession } from "@/lib/admin-auth";
import {
  buildBoardCommentAuthorId,
  canDeleteBoardComment,
  getBoardCommentForMutation,
  isBoardCommentsStorageMissing,
  softDeleteBoardComment,
} from "@/lib/board-comments";
import { parsePublicAuthSessionCookieValue, PUBLIC_AUTH_SESSION_COOKIE } from "@/lib/public-auth";

export const runtime = "nodejs";

export async function DELETE(
  _req: Request,
  { params }: { params: Promise<{ id: string; commentId: string }> }
) {
  const { id, commentId } = await params;
  try {
    const cookieStore = await cookies();
    const session = parsePublicAuthSessionCookieValue(cookieStore.get(PUBLIC_AUTH_SESSION_COOKIE)?.value);
    const isAdmin = isValidAdminSession(cookieStore.get(ADMIN_SESSION_COOKIE)?.value);
    const currentAuthorId = session ? buildBoardCommentAuthorId(session.provider, session.providerUserId) : null;

    const comment = await getBoardCommentForMutation(commentId);
    if (!comment || comment.post_id !== id || comment.deleted_at) {
      return NextResponse.json({ ok: false, message: "댓글을 찾을 수 없습니다." }, { status: 404 });
    }

    if (!canDeleteBoardComment({ isAdmin, authorId: comment.author_id, currentAuthorId })) {
      return NextResponse.json({ ok: false, message: "삭제 권한이 없습니다." }, { status: 403 });
    }

    const deletedBy = isAdmin ? "admin" : currentAuthorId || "";
    const deleted = await softDeleteBoardComment(commentId, deletedBy);
    revalidatePath("/board");
    revalidatePath(`/board/${id}`);
    return NextResponse.json({ ok: true, comment: deleted });
  } catch (error) {
    if (isBoardCommentsStorageMissing(error)) {
      return NextResponse.json({ ok: false, message: "댓글 기능을 준비 중입니다." }, { status: 503 });
    }
    return NextResponse.json({ ok: false, message: "댓글을 삭제하지 못했습니다." }, { status: 500 });
  }
}
```

- [ ] **Step 3: Run API contract and build**

Run:

```powershell
npm.cmd run test:board:comments
npm.cmd run build
```

Expected: API checks pass; UI/list checks still fail until later tasks.

- [ ] **Step 4: Commit API routes**

Run:

```powershell
git add app/api/board/[id]/comments/route.ts app/api/board/[id]/comments/[commentId]/route.ts
git commit -m "feat: add board comment API"
```

---

### Task 5: Add BoardComments Client UI

**Files:**
- Create: `components/board/BoardComments.tsx`
- Test: `scripts/tools/board-comments-contract.test.js`

- [ ] **Step 1: Create the client component**

Create `components/board/BoardComments.tsx`:

```tsx
"use client";

import { useRouter } from "next/navigation";
import { useMemo, useState, useTransition } from "react";

import type { BoardCommentRow } from "@/lib/board-comments";
import type { PublicAuthSession } from "@/lib/public-auth";

type BoardCommentsProps = {
  postId: string;
  initialComments: BoardCommentRow[];
  storageReady: boolean;
  session: PublicAuthSession | null;
  currentAuthorId: string | null;
  isAdmin: boolean;
};

function formatCommentDate(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "-";
  return new Intl.DateTimeFormat("ko-KR", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  }).format(date);
}

function canDeleteComment(comment: BoardCommentRow, currentAuthorId: string | null, isAdmin: boolean) {
  return isAdmin || Boolean(currentAuthorId && comment.author_id === currentAuthorId);
}

export function BoardComments({
  postId,
  initialComments,
  storageReady,
  session,
  currentAuthorId,
  isAdmin,
}: BoardCommentsProps) {
  const router = useRouter();
  const [comments, setComments] = useState(initialComments);
  const [content, setContent] = useState("");
  const [message, setMessage] = useState("");
  const [isPending, startTransition] = useTransition();
  const remaining = 300 - content.length;
  const commentCountLabel = useMemo(() => `댓글 ${comments.length}`, [comments.length]);

  if (!storageReady) {
    return (
      <section className="rounded-[1.6rem] border border-white/8 bg-[linear-gradient(180deg,rgba(10,16,18,0.98),rgba(7,10,11,0.94))] p-5 shadow-[0_22px_70px_rgba(0,0,0,0.16)]">
        <h2 className="text-sm font-black text-white">댓글</h2>
        <p className="mt-3 text-sm font-medium text-white/58">댓글 기능을 준비 중입니다.</p>
      </section>
    );
  }

  async function submitComment(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setMessage("");
    const nextContent = content.trim();
    if (!nextContent) {
      setMessage("댓글 내용을 입력해 주세요.");
      return;
    }

    const response = await fetch(`/api/board/${encodeURIComponent(postId)}/comments`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ content: nextContent }),
    });
    const payload = (await response.json().catch(() => ({}))) as {
      ok?: boolean;
      message?: string;
      comment?: BoardCommentRow;
    };

    if (!response.ok || !payload.ok || !payload.comment) {
      setMessage(payload.message || "댓글을 등록하지 못했습니다. 잠시 후 다시 시도해 주세요.");
      return;
    }

    setComments((current) => [...current, payload.comment as BoardCommentRow]);
    setContent("");
    startTransition(() => router.refresh());
  }

  async function deleteComment(commentId: string) {
    if (!window.confirm("댓글을 삭제할까요?")) return;
    setMessage("");
    const response = await fetch(
      `/api/board/${encodeURIComponent(postId)}/comments/${encodeURIComponent(commentId)}`,
      { method: "DELETE" }
    );
    const payload = (await response.json().catch(() => ({}))) as { ok?: boolean; message?: string };
    if (!response.ok || !payload.ok) {
      setMessage(payload.message || "댓글을 삭제하지 못했습니다.");
      return;
    }
    setComments((current) => current.filter((comment) => comment.id !== commentId));
    startTransition(() => router.refresh());
  }

  return (
    <section className="rounded-[1.6rem] border border-white/8 bg-[linear-gradient(180deg,rgba(10,16,18,0.98),rgba(7,10,11,0.94))] p-5 shadow-[0_22px_70px_rgba(0,0,0,0.16)]">
      <div className="flex items-center justify-between gap-3">
        <h2 className="text-sm font-black text-white">댓글</h2>
        <span className="text-xs font-bold text-white/42">{commentCountLabel}</span>
      </div>

      <div className="mt-4 divide-y divide-white/8">
        {comments.length ? (
          comments.map((comment) => (
            <div key={comment.id} className="py-4">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="flex flex-wrap items-center gap-2 text-xs font-bold text-white/46">
                  <span className="text-white/78">{comment.author_name}</span>
                  <span>{formatCommentDate(comment.created_at)}</span>
                </div>
                {canDeleteComment(comment, currentAuthorId, isAdmin) ? (
                  <button
                    type="button"
                    onClick={() => deleteComment(comment.id)}
                    disabled={isPending}
                    className="rounded-lg border border-white/10 px-3 py-1 text-xs font-bold text-white/58 transition hover:border-white/22 hover:text-white"
                  >
                    삭제
                  </button>
                ) : null}
              </div>
              <p className="mt-2 whitespace-pre-wrap text-sm font-medium leading-7 text-white/76">{comment.content}</p>
            </div>
          ))
        ) : (
          <p className="rounded-[1.1rem] border border-dashed border-white/10 bg-white/[0.02] px-4 py-8 text-center text-sm font-medium text-white/50">
            아직 댓글이 없습니다.
          </p>
        )}
      </div>

      <div className="mt-5 border-t border-white/8 pt-4">
        {session ? (
          <form onSubmit={submitComment} className="space-y-3">
            <textarea
              value={content}
              onChange={(event) => setContent(event.target.value.slice(0, 300))}
              maxLength={300}
              rows={3}
              className="w-full resize-none rounded-xl border border-white/10 bg-black/20 px-4 py-3 text-sm font-medium text-white outline-none transition placeholder:text-white/28 focus:border-nzu-green/50"
              placeholder="댓글을 입력하세요."
            />
            <div className="flex flex-wrap items-center justify-between gap-3">
              <span className="text-xs font-bold text-white/38">{content.length}/300</span>
              <button
                type="submit"
                disabled={isPending || !content.trim() || remaining < 0}
                className="inline-flex min-h-10 items-center justify-center rounded-xl bg-nzu-green px-4 text-sm font-black text-black transition hover:-translate-y-0.5 disabled:cursor-not-allowed disabled:opacity-45"
              >
                등록
              </button>
            </div>
          </form>
        ) : (
          <p className="text-sm font-medium text-white/58">SOOP 로그인 후 댓글을 작성할 수 있습니다.</p>
        )}
        {message ? <p className="mt-3 text-sm font-bold text-amber-200">{message}</p> : null}
      </div>
    </section>
  );
}
```

- [ ] **Step 2: Run build**

Run:

```powershell
npm.cmd run build
```

Expected: PASS.

- [ ] **Step 3: Commit the component**

Run:

```powershell
git add components/board/BoardComments.tsx
git commit -m "feat: add board comments component"
```

---

### Task 6: Integrate Detail Page And Board List Counts

**Files:**
- Modify: `app/board/[id]/page.tsx`
- Modify: `app/board/page.tsx`
- Modify: `lib/board.ts`
- Test: `scripts/tools/board-comments-contract.test.js`

- [ ] **Step 1: Add board list count helper**

Modify `lib/board.ts`:

```ts
import { getVisibleBoardCommentCounts } from "@/lib/board-comments";
```

Add these types and function after `listBoardPosts`:

```ts
export type BoardPostWithCommentCount = BoardPostRow & {
  comment_count: number;
};

export async function listBoardPostsWithCommentCounts(limit = BOARD_POST_LIMIT) {
  const result = await listBoardPosts(limit);
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
```

- [ ] **Step 2: Replace board list data source and render `[N]`**

Modify `app/board/page.tsx` import:

```ts
  listBoardPostsWithCommentCounts,
```

Replace:

```ts
const board = await listBoardPosts();
```

with:

```ts
const board = await listBoardPostsWithCommentCounts();
```

Inside the title link after `<span className="truncate">{post.title}</span>`, add:

```tsx
{post.comment_count > 0 ? (
  <span className="shrink-0 text-xs font-black text-nzu-green">[{post.comment_count}]</span>
) : null}
```

- [ ] **Step 3: Replace detail placeholder with real comments**

Modify `app/board/[id]/page.tsx` imports:

```ts
import { BoardComments } from "@/components/board/BoardComments";
import { buildBoardCommentAuthorId, listVisibleBoardComments } from "@/lib/board-comments";
```

After `const renderedContent = renderBoardContentToHtml(post.content);`, add:

```ts
  const comments = await listVisibleBoardComments(post.id);
  const currentAuthorId = session ? buildBoardCommentAuthorId(session.provider, session.providerUserId) : null;
```

Replace the current Coming Soon comments `<section ...>` with:

```tsx
        <BoardComments
          postId={post.id}
          initialComments={comments.comments}
          storageReady={comments.storageReady}
          session={session}
          currentAuthorId={currentAuthorId}
          isAdmin={isAdmin}
        />
```

- [ ] **Step 4: Run focused and full verification**

Run:

```powershell
npm.cmd run test:board:comments
npm.cmd run build
```

Expected: both PASS.

- [ ] **Step 5: Commit integration**

Run:

```powershell
git add app/board/[id]/page.tsx app/board/page.tsx lib/board.ts
git commit -m "feat: integrate board comments"
```

---

### Task 7: Final Verification And Rollout Notes

**Files:**
- Modify: `docs/superpowers/specs/2026-05-18-board-comments-mvp-design.md`
- Optional Modify: `README.md` or ops notes only if the repo already documents board SQL setup there.

- [ ] **Step 1: Run focused checks**

Run:

```powershell
npm.cmd run test:board:comments
npm.cmd run build
```

Expected: PASS.

- [ ] **Step 2: Run broader predeploy check if time allows**

Run:

```powershell
npm.cmd run verify:predeploy
```

Expected: PASS. If this is too slow, run and report the focused checks plus `npm.cmd run pipeline:health` status separately.

- [ ] **Step 3: Start the dev server on allowed port 3000**

Run:

```powershell
npm.cmd run dev -- -p 3000
```

Expected: local dev server starts on `http://localhost:3000`.

- [ ] **Step 4: Browser-check the no-table fallback and visible UI**

Open:

```text
http://localhost:3000/board
http://localhost:3000/board/<existing-post-id>
```

Expected:

- `/board` loads.
- Titles show `[N]` only for posts with visible comments once the table exists.
- `/board/[id]` shows the comment section below post content.
- Without `board_comments` applied, the detail page still renders the post and shows `댓글 기능을 준비 중입니다.`
- No console errors unrelated to missing production data.

- [ ] **Step 5: Document SQL rollout instruction**

Add this note to the design spec under Rollout Notes:

```md
- Production rollout requires applying `scripts/sql/create-board-comments.sql`
  before comment writes are expected to work. The UI is intentionally tolerant
  of the table being absent.
```

- [ ] **Step 6: Commit verification/docs**

Run:

```powershell
git add docs/superpowers/specs/2026-05-18-board-comments-mvp-design.md
git commit -m "docs: note board comments rollout"
```

Skip this commit if the note already exists and no file changed.

---

## Self-Review

- Spec coverage:
  - SOOP-only writes: Task 4 API checks public session.
  - Author/admin delete: Task 4 delete route and Task 3 helper.
  - 300-character text-only comments: Task 3 validation and Task 5 textarea hard limit.
  - Soft delete and hidden deleted comments: Task 2 schema, Task 3 queries, Task 4 delete route.
  - Board list `[N]`: Task 6.
  - No notifications/replies/reactions: no tasks add them.
  - Missing-table fallback: Task 3 helper and Task 5 fallback UI.
- Placeholder scan: no `TBD`, `TODO`, or unspecified implementation steps remain.
- Type consistency:
  - `BoardCommentRow`, `buildBoardCommentAuthorId`, `listVisibleBoardComments`, and `getVisibleBoardCommentCounts` are introduced before use.
  - API route names match the plan and contract test.
  - `comment_count` is introduced in `BoardPostWithCommentCount` before board-page usage.
