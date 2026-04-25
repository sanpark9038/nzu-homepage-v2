# Board Table UI Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Rework the public board into a table-style forum flow with a dedicated detail page, simplified write form, admin-only category support, preserved SOOP write/download gating, and a lightweight pre-write notice flow.

**Architecture:** Keep the current board API/auth foundation and reshape the user-facing routes around it. Extend `board_posts` with a lightweight nullable `category` field, add helper functions for single-post reads, and rebuild the list/detail/write pages so they follow a classic board information structure while preserving the current dark HOSAGA look and login rules.

**Tech Stack:** Next.js App Router, TypeScript, Supabase admin client, server-rendered routes, existing SOOP public auth helpers, Tailwind CSS, Lucide icons.

---

### Task 1: Extend the board data model for admin-only categories and detail reads

**Files:**
- Modify: `scripts/sql/create-board-posts.sql`
- Modify: `lib/database.types.ts`
- Modify: `lib/board.ts`
- Modify: `app/api/board/route.ts`

- [ ] **Step 1: Add the nullable category column to the SQL bootstrap script**

Update `scripts/sql/create-board-posts.sql` so the table and follow-up `alter table` statements include:

```sql
category varchar null default null,
```

Add a defensive alter for existing databases:

```sql
alter table public.board_posts add column if not exists category varchar null default null;
```

- [ ] **Step 2: Reflect category in generated board types**

Update the `board_posts` entries in `lib/database.types.ts` so `Row`, `Insert`, and `Update` each include:

```ts
category: string | null
```

or optional variants in `Insert` / `Update`:

```ts
category?: string | null
```

- [ ] **Step 3: Add board category and single-post helpers**

In `lib/board.ts`, add:

```ts
export type BoardCategory = "notice" | "schedule" | null;
```

Add normalization helpers that keep public users on `null`:

```ts
function normalizeCategory(value: unknown): BoardCategory {
  const text = String(value || "").trim().toLowerCase();
  if (text === "notice") return "notice";
  if (text === "schedule") return "schedule";
  return null;
}
```

Use it inside `normalizeBoardPostInput(...)` and default to `null` for the current public composer path.

Also add a single-post reader:

```ts
export async function getBoardPostById(id: string) {
  const supabase = createSupabaseAdminClient();
  const { data, error } = await supabase
    .from("board_posts")
    .select("*")
    .eq("id", id)
    .eq("published", true)
    .maybeSingle();

  if (error) throw error;
  return (data || null) as BoardPostRow | null;
}
```

- [ ] **Step 4: Keep public POST writes on null category**

In `app/api/board/route.ts`, ensure the public POST path explicitly sends:

```ts
category: null,
```

as part of the normalized input so non-admin users cannot set a board label through client payloads.

- [ ] **Step 5: Run type verification for the data-model changes**

Run:

```powershell
.\node_modules\.bin\tsc.cmd --noEmit
```

Expected: success with no new type errors.

### Task 2: Rebuild `/board` into a table-style forum list

**Files:**
- Modify: `app/board/page.tsx`
- Modify: `lib/board.ts`

- [ ] **Step 1: Add list-formatting helpers for labels and attachment indicators**

In `lib/board.ts`, add lightweight UI helpers:

```ts
export function getBoardCategoryLabel(category: string | null) {
  if (category === "notice") return "공지";
  if (category === "schedule") return "일정";
  return "";
}
```

and a helper for attachment presence:

```ts
export function hasBoardMedia(post: Pick<BoardPostRow, "image_url" | "video_url">) {
  return {
    hasImage: Boolean(post.image_url),
    hasVideo: Boolean(post.video_url),
  };
}
```

- [ ] **Step 2: Replace feed cards with a table-style board list**

Update `app/board/page.tsx` so the main list becomes a header + toolbar + table layout. The table should include:

```text
말머리 | 제목 | 글쓴이 | 날짜 | 조회 | 추천
```

Implementation requirements:
- title links to `/board/${post.id}`
- `category = null` leaves the label cell blank
- image/video icons render inline in the title cell
- `조회` and `추천` render shell values for now, not real counters
- both top and bottom `글쓰기` buttons remain visible

- [ ] **Step 3: Keep logged-out write guidance visible in the board list**

On `/board`, add or preserve a short notice near the write CTA that communicates:

```text
숲티비 로그인 후 작성 가능합니다.
```

The CTA should still route to `/api/auth/soop/start?next=/board/write` when there is no session.

- [ ] **Step 4: Keep empty-state behavior table-shaped**

If there are no posts, render an empty table-like shell rather than the old feed-card empty state, while preserving the logged-in / logged-out write CTA logic.

- [ ] **Step 5: Run build verification for the board list**

Run:

```powershell
npm.cmd run build
```

Expected: the board route builds successfully with the new list layout.

### Task 3: Add `/board/[id]` and preserve gated download/media behavior

**Files:**
- Create: `app/board/[id]/page.tsx`
- Modify: `lib/board.ts`

- [ ] **Step 1: Build the detail page route**

Create `app/board/[id]/page.tsx` as a server route that:
- reads `params.id`
- loads the post via `getBoardPostById`
- calls `notFound()` if missing
- renders breadcrumb/meta strip, title/date, author, shell view/recommendation stats, body, media, download action, comment shell, and `게시판으로 돌아가기`

- [ ] **Step 2: Reuse existing media and download logic**

Use the existing helpers already used by the list/detail-capable board flow:

```ts
buildVideoEmbedUrl(post.video_url)
```

and keep download links pointed at:

```ts
/api/board/download?url=...&next=/board/${post.id}
```

so the gated flow returns to the detail page after login.

- [ ] **Step 3: Add a comment-area shell only**

At the bottom of the detail page, add a clearly non-functional comment area with copy such as:

```text
댓글 기능은 준비중입니다.
```

Do not add comment storage or interactive submission behavior in this task.

- [ ] **Step 4: Verify route behavior with build**

Run:

```powershell
npm.cmd run build
```

Expected: `/board/[id]` is included as a dynamic route without route-generation errors.

### Task 4: Rebuild `/board/write` into a simpler board-style composer

**Files:**
- Modify: `app/board/write/page.tsx`
- Modify: `components/board/BoardPostComposer.tsx`

- [ ] **Step 1: Remove public author-name entry from the composer**

Update `components/board/BoardPostComposer.tsx` so public users no longer manually enter `author_name`. The POST body should rely on the session display name already enforced by the route.

- [ ] **Step 2: Reshape the write form to a board-style layout**

Update the write page and composer layout so it resembles a simplified classic board editor:
- title first
- content textarea
- external image URL
- video URL
- external download URL
- rules/help panel
- no category selector
- no draft controls
- auto-hide the writing notice when the user focuses or types in the content field
- allow reopening the notice via a small `안내 보기` action

- [ ] **Step 3: Keep login-gated write return behavior intact**

Preserve this route behavior in `app/board/write/page.tsx`:

```ts
redirect("/api/auth/soop/start?next=/board/write");
```

when no public session exists, and show the logged-in session context when present.

- [ ] **Step 4: Redirect successful submissions back into the board flow**

After a successful post, send the user back to `/board` as today unless a cleaner detail redirect is already available and trivial to wire from the POST response.

- [ ] **Step 5: Run final verification**

Run:

```powershell
.\node_modules\.bin\tsc.cmd --noEmit
npm.cmd run build
```

Expected:
- typecheck passes
- build passes
- board list, write page, and detail route all compile successfully
