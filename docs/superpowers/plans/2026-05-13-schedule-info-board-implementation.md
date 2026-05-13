# Schedule Info Board Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add an administrator-managed `정보/일정` board-post flow that powers the public `/schedule` page with today-first list cards and inline details.

**Architecture:** Reuse `board_posts` as the source of truth, with additive nullable schedule fields and `category = "schedule"` as the internal marker. Keep normal public board writing separate from admin schedule writing by adding admin-only schedule API/routes. Replace the public schedule page's prediction fixture path with schedule board posts.

**Tech Stack:** Next.js App Router, React Server/Client Components, Supabase, focused Node contract tests, existing admin cookie auth, Vercel/agent-browser verification.

---

## RB Criteria

- Do not apply production SQL or write production data in this implementation pass.
- Preserve locked navigation labels, including `대회일정`.
- Keep public user board writing unable to set schedule fields.
- Make each task pass focused tests before moving on.
- Verification order after implementation: focused tests -> `npm.cmd run pipeline:health` -> `npm.cmd run verify:predeploy` if the focused and health checks pass.
- Commit boundaries:
  - Commit 1: schema/types/contracts.
  - Commit 2: board helpers and admin schedule API.
  - Commit 3: admin schedule composer/page.
  - Commit 4: board display and public schedule page.
  - Commit 5: docs and verification evidence.

## Files

Modify:

- `scripts/sql/create-board-posts.sql`
- `lib/database.types.ts`
- `lib/board.ts`
- `app/api/board/images/route.ts`
- `app/api/board/[id]/route.ts`
- `app/board/page.tsx`
- `app/board/[id]/page.tsx`
- `app/schedule/page.tsx`
- `components/admin/AdminNav.tsx`
- `package.json`
- `docs/harness/exec-plans/active/2026-05-13-schedule-info-board.md`

Create:

- `app/api/admin/schedule/route.ts`
- `app/api/admin/schedule/[id]/route.ts`
- `app/admin/schedule/page.tsx`
- `components/admin/schedule/SchedulePostComposer.tsx`
- `components/schedule/ScheduleInfoList.tsx`
- `scripts/tools/schedule-info-board-contract.test.js`
- `scripts/tools/schedule-info-page-contract.test.js`

Optional if needed:
- `components/schedule/ScheduleInfoCard.tsx`

## Task 1: Schema And Contract Red

**Files:**
- Modify: `scripts/sql/create-board-posts.sql`
- Modify: `lib/database.types.ts`
- Create: `scripts/tools/schedule-info-board-contract.test.js`
- Modify: `package.json`

- [ ] **Step 1: Write the failing schema/contract test**

Create `scripts/tools/schedule-info-board-contract.test.js`:

```js
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");

const repoRoot = path.resolve(__dirname, "..", "..");

function readProjectFile(filePath) {
  return fs.readFileSync(path.join(repoRoot, filePath), "utf8");
}

test("board SQL defines additive schedule info fields", () => {
  const sql = readProjectFile("scripts/sql/create-board-posts.sql");

  assert.match(sql, /schedule_date\s+date/i);
  assert.match(sql, /schedule_start_time\s+time\s+without\s+time\s+zone/i);
  assert.match(sql, /schedule_display_name\s+text/i);
  assert.match(sql, /external_link_url\s+text/i);
  assert.match(sql, /board_posts_schedule_public_idx/i);
});

test("database types include schedule info board fields", () => {
  const types = readProjectFile("lib/database.types.ts");

  for (const field of ["schedule_date", "schedule_start_time", "schedule_display_name", "external_link_url"]) {
    assert.match(types, new RegExp(`${field}: string \\\\| null`));
    assert.match(types, new RegExp(`${field}\\\\?: string \\\\| null`));
  }
});

test("board schedule label is displayed as info schedule", () => {
  const board = readProjectFile("lib/board.ts");

  assert.match(board, /if\s*\(category === "schedule"\)\s*return "정보\/일정"/);
});
```

- [ ] **Step 2: Add an npm script for the new contract**

In `package.json`, add:

```json
"test:schedule-info-board-contract": "node scripts/tools/schedule-info-board-contract.test.js"
```

- [ ] **Step 3: Run the red contract**

Run:

```powershell
npm.cmd run test:schedule-info-board-contract
```

Expected: FAIL because SQL/types/helpers do not yet contain the schedule info fields and label.

- [ ] **Step 4: Add schedule columns and index to SQL**

Update `scripts/sql/create-board-posts.sql` so the table definition contains:

```sql
  schedule_date date null,
  schedule_start_time time without time zone null,
  schedule_display_name text null,
  external_link_url text null,
```

Add idempotent alter statements:

```sql
alter table public.board_posts add column if not exists schedule_date date null;
alter table public.board_posts add column if not exists schedule_start_time time without time zone null;
alter table public.board_posts add column if not exists schedule_display_name text null;
alter table public.board_posts add column if not exists external_link_url text null;

create index if not exists board_posts_schedule_public_idx
  on public.board_posts (published, category, schedule_date, schedule_start_time, created_at);
```

- [ ] **Step 5: Update local database types**

In `lib/database.types.ts`, add the four nullable fields to `board_posts.Row`, `Insert`, and `Update`:

```ts
external_link_url: string | null
schedule_date: string | null
schedule_display_name: string | null
schedule_start_time: string | null
```

For `Insert` and `Update`, use optional nullable properties:

```ts
external_link_url?: string | null
schedule_date?: string | null
schedule_display_name?: string | null
schedule_start_time?: string | null
```

- [ ] **Step 6: Change the schedule category label**

In `lib/board.ts`, change:

```ts
if (category === "schedule") return "일정";
```

to:

```ts
if (category === "schedule") return "정보/일정";
```

Keep `notice` behavior unchanged.

- [ ] **Step 7: Run the green contract**

Run:

```powershell
npm.cmd run test:schedule-info-board-contract
```

Expected: PASS.

- [ ] **Step 8: Commit schema contract slice**

Run:

```powershell
git add scripts/sql/create-board-posts.sql lib/database.types.ts lib/board.ts scripts/tools/schedule-info-board-contract.test.js package.json
git commit -m "Add schedule info board schema contract"
```

Expected: one focused commit. Do not apply SQL to production.

## Task 2: Board Helpers And Admin API

**Files:**
- Modify: `lib/board.ts`
- Create: `app/api/admin/schedule/route.ts`
- Create: `app/api/admin/schedule/[id]/route.ts`
- Modify: `scripts/tools/schedule-info-board-contract.test.js`

- [ ] **Step 1: Extend the focused contract for helpers and admin routes**

Append these tests to `scripts/tools/schedule-info-board-contract.test.js`:

```js
test("public board creation remains unable to create schedule posts", () => {
  const route = readProjectFile("app/api/board/route.ts");

  assert.match(route, /category:\s*null/);
  assert.doesNotMatch(route, /schedule_date/);
  assert.doesNotMatch(route, /schedule_display_name/);
});

test("board helpers define admin schedule input and list helpers", () => {
  const board = readProjectFile("lib/board.ts");

  assert.match(board, /normalizeAdminSchedulePostInput/);
  assert.match(board, /validateAdminSchedulePostInput/);
  assert.match(board, /isScheduleInfoStorageMissing/);
  assert.match(board, /listScheduleInfoPosts/);
  assert.match(board, /listAdminScheduleInfoPosts/);
  assert.match(board, /createAdminSchedulePost/);
  assert.match(board, /updateAdminSchedulePostById/);
  assert.match(board, /dateKeyFormatter\.format\(date\) !== text/);
  assert.match(board, /hasInvalidOptionalUrlInput/);
});

test("admin schedule routes are admin-cookie protected", () => {
  const createRoute = readProjectFile("app/api/admin/schedule/route.ts");
  const itemRoute = readProjectFile("app/api/admin/schedule/[id]/route.ts");

  for (const source of [createRoute, itemRoute]) {
    assert.match(source, /ADMIN_SESSION_COOKIE/);
    assert.match(source, /isValidAdminSession/);
    assert.match(source, /NextResponse\.json\(\{\s*ok:\s*false/);
  }
});

test("admin schedule image upload accepts admin session and schedule routes clean R2 images", () => {
  const imageRoute = readProjectFile("app/api/board/images/route.ts");
  const itemRoute = readProjectFile("app/api/admin/schedule/[id]/route.ts");

  assert.match(imageRoute, /ADMIN_SESSION_COOKIE/);
  assert.match(imageRoute, /isValidAdminSession/);
  assert.match(imageRoute, /admin:/);
  assert.match(itemRoute, /deleteBoardImageFromR2/);
  assert.match(itemRoute, /previousImageUrl/);
});

test("admin schedule validation rejects invalid optional external links", () => {
  const board = readProjectFile("lib/board.ts");
  const createRoute = readProjectFile("app/api/admin/schedule/route.ts");

  assert.match(board, /hasInvalidOptionalUrlInput/);
  assert.match(board, /external_link_url/);
  assert.match(createRoute, /validateAdminSchedulePostInput\(input,\s*body\)/);
});
```

- [ ] **Step 2: Run the red contract**

Run:

```powershell
npm.cmd run test:schedule-info-board-contract
```

Expected: FAIL because helper functions and admin routes do not exist yet.

- [ ] **Step 3: Add schedule normalization helpers**

In `lib/board.ts`, add these helpers near the existing normalizers:

```ts
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
```

- [ ] **Step 4: Add admin schedule input normalizer**

In `lib/board.ts`, add:

```ts
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
    published: true,
  } satisfies BoardPostInsert;
}
```

- [ ] **Step 5: Add admin schedule update normalizer**

In `lib/board.ts`, add:

```ts
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
```

- [ ] **Step 6: Add admin schedule validation**

In `lib/board.ts`, add:

```ts
function hasInvalidOptionalUrlInput(rawValue: unknown, normalizedValue: string | null) {
  return Boolean(normalizeText(rawValue)) && !normalizedValue;
}

export function validateAdminSchedulePostInput(
  input: ReturnType<typeof normalizeAdminSchedulePostInput> | ReturnType<typeof normalizeAdminSchedulePostUpdateInput>,
  rawValue: unknown = {}
) {
  const raw = (rawValue || {}) as Partial<BoardPostInsert | BoardPostUpdate>;
  if (hasInvalidOptionalUrlInput(raw.external_link_url, input.external_link_url)) {
    return "방송 링크 형식이 올바르지 않습니다.";
  }
  if (!input.title) return "제목을 입력하세요.";
  if (!input.content) return "본문을 입력하세요.";
  if (!input.schedule_display_name) return "표시명을 입력하세요.";
  if (!input.schedule_date) return "일정 날짜를 입력하세요.";
  return null;
}
```

- [ ] **Step 7: Add schedule query helper**

In `lib/board.ts`, add the schedule-column migration guard:

```ts
export function isScheduleInfoStorageMissing(error: unknown) {
  const message = error instanceof Error ? error.message : String(error || "");
  return (
    isBoardStorageMissing(error) ||
    /schedule_date|schedule_start_time|schedule_display_name|external_link_url|schema cache|42703/i.test(message)
  );
}
```

Then add the public query helper:

```ts
export async function listScheduleInfoPosts(options: { fromDate?: string; toDate?: string; limit?: number } = {}) {
  try {
    const limit = Math.min(Math.max(options.limit || 100, 1), 100);
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
```

- [ ] **Step 8: Add create/update helpers**

In `lib/board.ts`, add:

```ts
export async function createAdminSchedulePost(input: ReturnType<typeof normalizeAdminSchedulePostInput>) {
  const supabase = createSupabaseAdminClient();
  const { data, error } = await supabase.from("board_posts").insert(input).select("*").single();
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
    .update({ ...input, updated_at: new Date().toISOString() })
    .eq("id", id)
    .eq("category", "schedule")
    .select("*")
    .single();

  if (error) throw error;
  return data as BoardPostRow;
}
```

- [ ] **Step 9: Create admin schedule collection API**

Create `app/api/admin/schedule/route.ts`:

```ts
import { cookies } from "next/headers";
import { revalidatePath } from "next/cache";
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
```

- [ ] **Step 10: Create admin schedule item API**

Create `app/api/admin/schedule/[id]/route.ts`:

```ts
import { cookies } from "next/headers";
import { revalidatePath } from "next/cache";
import { NextResponse } from "next/server";

import { ADMIN_SESSION_COOKIE, isValidAdminSession } from "@/lib/admin-auth";
import {
  deleteBoardPostById,
  getBoardPostForMutation,
  isScheduleInfoStorageMissing,
  normalizeAdminSchedulePostUpdateInput,
  updateAdminSchedulePostById,
  validateAdminSchedulePostInput,
} from "@/lib/board";

export const runtime = "nodejs";

async function requireAdmin() {
  const cookieStore = await cookies();
  return isValidAdminSession(cookieStore.get(ADMIN_SESSION_COOKIE)?.value);
}

export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  if (!(await requireAdmin())) {
    return NextResponse.json({ ok: false, message: "unauthorized" }, { status: 401 });
  }

  const { id } = await params;

  try {
    const body = (await req.json().catch(() => ({}))) as Record<string, unknown>;
    const input = normalizeAdminSchedulePostUpdateInput(body);
    const validationMessage = validateAdminSchedulePostInput(input, body);
    if (validationMessage) {
      return NextResponse.json({ ok: false, message: validationMessage }, { status: 400 });
    }

    const post = await updateAdminSchedulePostById(id, input);
    revalidatePath("/board");
    revalidatePath(`/board/${id}`);
    revalidatePath("/schedule");

    return NextResponse.json({ ok: true, post });
  } catch (error) {
    if (isScheduleInfoStorageMissing(error)) {
      return NextResponse.json({ ok: false, message: "board_posts storage is not ready" }, { status: 503 });
    }
    return NextResponse.json(
      { ok: false, message: error instanceof Error ? error.message : "failed to update schedule post" },
      { status: 500 }
    );
  }
}

export async function DELETE(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  if (!(await requireAdmin())) {
    return NextResponse.json({ ok: false, message: "unauthorized" }, { status: 401 });
  }

  const { id } = await params;

  try {
    const post = await getBoardPostForMutation(id);
    if (!post || post.category !== "schedule") {
      return NextResponse.json({ ok: false, message: "schedule post not found" }, { status: 404 });
    }

    await deleteBoardPostById(id);
    revalidatePath("/board");
    revalidatePath(`/board/${id}`);
    revalidatePath("/schedule");

    return NextResponse.json({ ok: true, deleted: { post: true } });
  } catch (error) {
    if (isScheduleInfoStorageMissing(error)) {
      return NextResponse.json({ ok: false, message: "board_posts storage is not ready" }, { status: 503 });
    }
    return NextResponse.json(
      { ok: false, message: error instanceof Error ? error.message : "failed to delete schedule post" },
      { status: 500 }
    );
  }
}
```

- [ ] **Step 11: Allow admin-authenticated board image uploads**

In `app/api/board/images/route.ts`, import admin auth:

```ts
import { ADMIN_SESSION_COOKIE, isValidAdminSession } from "@/lib/admin-auth";
```

After reading cookies, replace the public-session-only check with an admin fallback:

```ts
  const cookieStore = await cookies();
  const session = parsePublicAuthSessionCookieValue(cookieStore.get(PUBLIC_AUTH_SESSION_COOKIE)?.value);
  const isAdmin = isValidAdminSession(cookieStore.get(ADMIN_SESSION_COOKIE)?.value);

  if (!session && !isAdmin) {
    return NextResponse.json({ ok: false, message: "이미지 업로드는 로그인이 필요합니다." }, { status: 401 });
  }

  const uploadRateLimitKey = session ? `${session.provider}:${session.providerUserId}` : "admin:schedule";
```

Then change:

```ts
    assertBoardImageUploadRateLimit(`${session.provider}:${session.providerUserId}`);
```

to:

```ts
    assertBoardImageUploadRateLimit(uploadRateLimitKey);
```

Expected: normal public board image uploads still require a public session, and admin schedule uploads work with the admin cookie.

- [ ] **Step 12: Add R2 cleanup to schedule update/delete**

In `app/api/admin/schedule/[id]/route.ts`, import:

```ts
import { deleteBoardImageFromR2 } from "@/lib/r2";
```

Inside `PATCH`, before updating:

```ts
    const previousPost = await getBoardPostForMutation(id);
    if (!previousPost || previousPost.category !== "schedule") {
      return NextResponse.json({ ok: false, message: "schedule post not found" }, { status: 404 });
    }
    const previousImageUrl = previousPost.image_url;
```

After the successful update:

```ts
    if (previousImageUrl && previousImageUrl !== post.image_url) {
      try {
        await deleteBoardImageFromR2(previousImageUrl);
      } catch (deleteError) {
        console.warn("[schedule] R2 image delete failed after schedule edit", { postId: id, deleteError });
      }
    }
```

Inside `DELETE`, after `getBoardPostForMutation(id)` confirms a schedule post and before revalidation:

```ts
    if (post.image_url) {
      try {
        await deleteBoardImageFromR2(post.image_url);
      } catch (deleteError) {
        console.warn("[schedule] R2 image delete failed after schedule delete", { postId: id, deleteError });
      }
    }
```

Expected: deleting or replacing an R2-hosted board image from a schedule post does not leave orphaned uploaded files.

- [ ] **Step 13: Run tests**

Run:

```powershell
npm.cmd run test:schedule-info-board-contract
npm.cmd run test:board-write-contract
npm.cmd run test:board-edit-contract
```

Expected: all pass.

- [ ] **Step 14: Type-check**

Run:

```powershell
npx.cmd tsc --noEmit
```

Expected: PASS.

- [ ] **Step 15: Commit helper/API slice**

Run:

```powershell
git add lib/board.ts app/api/admin/schedule app/api/board/images/route.ts scripts/tools/schedule-info-board-contract.test.js
git commit -m "Add admin schedule board API"
```

Expected: one focused commit.

## Task 3: Admin Schedule Composer

**Files:**
- Create: `components/admin/schedule/SchedulePostComposer.tsx`
- Create: `app/admin/schedule/page.tsx`
- Modify: `components/admin/AdminNav.tsx`
- Modify: `scripts/tools/schedule-info-board-contract.test.js`

- [ ] **Step 1: Extend contract for admin UI**

Append:

```js
test("admin schedule UI is a board-style composer with schedule fields", () => {
  const page = readProjectFile("app/admin/schedule/page.tsx");
  const composer = readProjectFile("components/admin/schedule/SchedulePostComposer.tsx");
  const adminNav = readProjectFile("components/admin/AdminNav.tsx");

  assert.match(page, /ADMIN_SESSION_COOKIE/);
  assert.match(page, /SchedulePostComposer/);
  assert.match(composer, /schedule_display_name/);
  assert.match(composer, /schedule_date/);
  assert.match(composer, /schedule_start_time/);
  assert.match(composer, /external_link_url/);
  assert.match(composer, /\/api\/admin\/schedule/);
  assert.match(composer, /\/api\/board\/images/);
  assert.match(composer, /method:\s*"PATCH"/);
  assert.match(composer, /method:\s*"DELETE"/);
  assert.match(composer, /published/);
  assert.match(composer, /type="file"/);
  assert.match(adminNav, /\/admin\/schedule/);
});
```

- [ ] **Step 2: Run red contract**

Run:

```powershell
npm.cmd run test:schedule-info-board-contract
```

Expected: FAIL because admin schedule UI does not exist.

- [ ] **Step 3: Add admin nav link**

In `components/admin/AdminNav.tsx`, add this entry near other admin content pages:

```ts
{ href: "/admin/schedule", label: "정보/일정" },
```

- [ ] **Step 4: Create admin schedule page**

Create `app/admin/schedule/page.tsx`:

```tsx
import { cookies } from "next/headers";
import { redirect } from "next/navigation";

import { AdminNav } from "@/components/admin/AdminNav";
import { SchedulePostComposer } from "@/components/admin/schedule/SchedulePostComposer";
import { ADMIN_SESSION_COOKIE, isValidAdminSession } from "@/lib/admin-auth";
import { listAdminScheduleInfoPosts } from "@/lib/board";

export const dynamic = "force-dynamic";

export default async function AdminSchedulePage() {
  const cookieStore = await cookies();
  if (!isValidAdminSession(cookieStore.get(ADMIN_SESSION_COOKIE)?.value)) {
    redirect("/admin/login?next=/admin/schedule");
  }

  const schedule = await listAdminScheduleInfoPosts(50);

  return (
    <main className="min-h-screen bg-background p-6 text-foreground md:p-10">
      <div className="mx-auto max-w-6xl space-y-6">
        <AdminNav />
        <header>
          <div className="text-[11px] font-black uppercase tracking-[0.24em] text-nzu-green">Schedule</div>
          <h1 className="mt-3 text-3xl font-black tracking-tight text-white">정보/일정 작성</h1>
          <p className="mt-2 text-sm font-medium leading-7 text-white/58">
            관리자 전용 일정 글쓰기입니다. 날짜와 표시명이 있는 글만 공개 일정 페이지에 노출됩니다.
          </p>
        </header>
        <SchedulePostComposer existingPosts={schedule.posts} />
      </div>
    </main>
  );
}
```

- [ ] **Step 5: Create the admin composer**

Create `components/admin/schedule/SchedulePostComposer.tsx` with a client form that posts JSON to `/api/admin/schedule`:

```tsx
"use client";

import { useRouter } from "next/navigation";
import { startTransition, useState } from "react";

import type { BoardPostRow } from "@/lib/board";

type SchedulePostComposerProps = {
  existingPosts: BoardPostRow[];
};

type FormState = {
  message: string;
  tone: "idle" | "success" | "error";
};

const initialState: FormState = { message: "", tone: "idle" };

export function SchedulePostComposer({ existingPosts }: SchedulePostComposerProps) {
  const router = useRouter();
  const [title, setTitle] = useState("");
  const [content, setContent] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [scheduleDate, setScheduleDate] = useState("");
  const [scheduleStartTime, setScheduleStartTime] = useState("");
  const [imageUrl, setImageUrl] = useState("");
  const [videoUrl, setVideoUrl] = useState("");
  const [externalLinkUrl, setExternalLinkUrl] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [state, setState] = useState<FormState>(initialState);

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setIsSubmitting(true);
    setState(initialState);

    try {
      const response = await fetch("/api/admin/schedule", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title,
          content,
          schedule_display_name: displayName,
          schedule_date: scheduleDate,
          schedule_start_time: scheduleStartTime,
          image_url: imageUrl,
          video_url: videoUrl,
          external_link_url: externalLinkUrl,
        }),
      });
      const payload = (await response.json().catch(() => ({}))) as { ok?: boolean; message?: string };
      if (!response.ok || !payload.ok) throw new Error(payload.message || "정보/일정 등록에 실패했습니다.");

      setTitle("");
      setContent("");
      setDisplayName("");
      setScheduleDate("");
      setScheduleStartTime("");
      setImageUrl("");
      setVideoUrl("");
      setExternalLinkUrl("");
      setState({ tone: "success", message: "정보/일정을 등록했습니다." });
      startTransition(() => router.refresh());
    } catch (error) {
      setState({ tone: "error", message: error instanceof Error ? error.message : "정보/일정 등록에 실패했습니다." });
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_22rem]">
      <form onSubmit={handleSubmit} className="space-y-5 rounded-[1.6rem] border border-white/8 bg-[linear-gradient(180deg,rgba(10,16,18,0.98),rgba(7,10,11,0.94))] p-5 shadow-[0_22px_70px_rgba(0,0,0,0.16)]">
        <section className="rounded-[1.25rem] border border-white/8 bg-white/[0.02] p-4">
          <div className="mb-4 flex items-start justify-between gap-3">
            <div>
              <h2 className="text-lg font-black text-white">일정 정보</h2>
              <p className="mt-1 text-xs font-bold text-white/52">일정 카드와 달력에 필요한 최소 정보입니다.</p>
            </div>
            <span className="rounded-full border border-nzu-green/30 bg-nzu-green/10 px-3 py-1 text-[11px] font-black text-nzu-green">관리자만 작성</span>
          </div>
          <div className="grid gap-4 md:grid-cols-2">
            <label className="space-y-2 text-sm font-bold text-white/72">
              <span>표시명 <span className="text-nzu-green">필수</span></span>
              <input value={displayName} onChange={(event) => setDisplayName(event.target.value)} className="w-full rounded-xl border border-white/10 bg-white/[0.03] px-4 py-3 text-sm font-medium text-white outline-none transition focus:border-nzu-green/60" placeholder="예: 해링, 싸나인, ASL, 8강, KCM" maxLength={24} />
            </label>
            <label className="space-y-2 text-sm font-bold text-white/72">
              <span>일정 날짜 <span className="text-nzu-green">필수</span></span>
              <input type="date" value={scheduleDate} onChange={(event) => setScheduleDate(event.target.value)} className="w-full rounded-xl border border-white/10 bg-white/[0.03] px-4 py-3 text-sm font-medium text-white outline-none transition focus:border-nzu-green/60" />
            </label>
            <label className="space-y-2 text-sm font-bold text-white/72">
              <span>시작시간 <span className="text-white/42">선택</span></span>
              <input type="time" value={scheduleStartTime} onChange={(event) => setScheduleStartTime(event.target.value)} className="w-full rounded-xl border border-white/10 bg-white/[0.03] px-4 py-3 text-sm font-medium text-white outline-none transition focus:border-nzu-green/60" />
            </label>
            <label className="space-y-2 text-sm font-bold text-white/72">
              <span>외부 링크 <span className="text-white/42">선택</span></span>
              <input value={externalLinkUrl} onChange={(event) => setExternalLinkUrl(event.target.value)} className="w-full rounded-xl border border-white/10 bg-white/[0.03] px-4 py-3 text-sm font-medium text-white outline-none transition focus:border-nzu-green/60" placeholder="SOOP, YouTube 등" />
            </label>
          </div>
        </section>

        <section className="space-y-4 rounded-[1.25rem] border border-white/8 bg-white/[0.02] p-4">
          <h2 className="text-lg font-black text-white">게시글 내용</h2>
          <label className="block space-y-2 text-sm font-bold text-white/72">
            <span>제목 <span className="text-nzu-green">필수</span></span>
            <input value={title} onChange={(event) => setTitle(event.target.value)} className="w-full rounded-xl border border-white/10 bg-white/[0.03] px-4 py-3 text-sm font-medium text-white outline-none transition focus:border-nzu-green/60" placeholder="제목을 입력하세요" maxLength={120} />
          </label>
          <label className="block space-y-2 text-sm font-bold text-white/72">
            <span>본문 <span className="text-nzu-green">필수</span></span>
            <textarea value={content} onChange={(event) => setContent(event.target.value)} className="min-h-[300px] w-full rounded-[1.2rem] border border-white/10 bg-white/[0.03] px-4 py-3 text-sm font-medium leading-7 text-white outline-none transition focus:border-nzu-green/60" placeholder="일정 상세와 게시글 본문에 함께 사용됩니다." maxLength={4000} />
          </label>
        </section>

        <div className="grid gap-4 md:grid-cols-2">
          <label className="space-y-2 text-sm font-bold text-white/72">
            <span>이미지 URL <span className="text-white/42">선택</span></span>
            <input value={imageUrl} onChange={(event) => setImageUrl(event.target.value)} className="w-full rounded-xl border border-white/10 bg-white/[0.03] px-4 py-3 text-sm font-medium text-white outline-none transition focus:border-nzu-green/60" placeholder="이미지 URL" />
          </label>
          <label className="space-y-2 text-sm font-bold text-white/72">
            <span>영상 URL <span className="text-white/42">선택</span></span>
            <input value={videoUrl} onChange={(event) => setVideoUrl(event.target.value)} className="w-full rounded-xl border border-white/10 bg-white/[0.03] px-4 py-3 text-sm font-medium text-white outline-none transition focus:border-nzu-green/60" placeholder="YouTube 또는 SOOP URL" />
          </label>
        </div>

        {state.message ? (
          <div className={state.tone === "success" ? "rounded-xl border border-nzu-green/30 bg-nzu-green/10 px-4 py-3 text-sm font-bold text-nzu-green" : "rounded-xl border border-rose-400/24 bg-rose-500/10 px-4 py-3 text-sm font-bold text-rose-200"}>
            {state.message}
          </div>
        ) : null}

        <button type="submit" disabled={isSubmitting} className="inline-flex min-h-12 items-center justify-center rounded-xl bg-nzu-green px-6 text-sm font-black text-black transition hover:-translate-y-0.5 disabled:translate-y-0 disabled:opacity-60">
          {isSubmitting ? "등록 중..." : "정보/일정 등록"}
        </button>
      </form>

      <aside className="rounded-[1.6rem] border border-white/8 bg-white/[0.03] p-4">
        <h2 className="text-lg font-black text-white">최근 정보/일정</h2>
        <div className="mt-4 space-y-3">
          {existingPosts.map((post) => (
            <div key={post.id} className="rounded-xl border border-white/8 bg-black/15 p-3">
              <div className="text-sm font-black text-white">{post.title}</div>
              <div className="mt-1 text-xs font-bold text-white/48">{post.schedule_date || "-"} {post.schedule_start_time || "시간 미정"}</div>
            </div>
          ))}
        </div>
      </aside>
    </div>
  );
}
```

- [ ] **Step 6: Extend the composer with edit/unpublish/delete and image upload controls**

Still in `components/admin/schedule/SchedulePostComposer.tsx`, update the React import:

```tsx
import { startTransition, useRef, useState } from "react";
```

Add these state values inside `SchedulePostComposer`:

```tsx
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [editingPostId, setEditingPostId] = useState<string | null>(null);
  const [published, setPublished] = useState(true);
  const [isUploadingImage, setIsUploadingImage] = useState(false);
```

Add these helpers inside `SchedulePostComposer` before `handleSubmit`:

```tsx
  function resetForm() {
    setEditingPostId(null);
    setTitle("");
    setContent("");
    setDisplayName("");
    setScheduleDate("");
    setScheduleStartTime("");
    setImageUrl("");
    setVideoUrl("");
    setExternalLinkUrl("");
    setPublished(true);
    if (fileInputRef.current) fileInputRef.current.value = "";
  }

  function fillFromPost(post: BoardPostRow) {
    setEditingPostId(post.id);
    setTitle(post.title);
    setContent(post.content);
    setDisplayName(post.schedule_display_name || "");
    setScheduleDate(post.schedule_date || "");
    setScheduleStartTime(post.schedule_start_time ? post.schedule_start_time.slice(0, 5) : "");
    setImageUrl(post.image_url || "");
    setVideoUrl(post.video_url || "");
    setExternalLinkUrl(post.external_link_url || "");
    setPublished(post.published !== false);
    setState(initialState);
  }

  async function uploadImageFile(file: File) {
    setIsUploadingImage(true);
    setState(initialState);
    try {
      const formData = new FormData();
      formData.append("file", file);
      const response = await fetch("/api/board/images", { method: "POST", body: formData });
      const payload = (await response.json().catch(() => ({}))) as {
        ok?: boolean;
        message?: string;
        image?: { url?: string };
      };
      if (!response.ok || !payload.ok || !payload.image?.url) {
        throw new Error(payload.message || "이미지 업로드에 실패했습니다.");
      }
      setImageUrl(payload.image.url);
      setState({ tone: "success", message: "이미지가 업로드되었습니다." });
    } catch (error) {
      setState({ tone: "error", message: error instanceof Error ? error.message : "이미지 업로드에 실패했습니다." });
    } finally {
      setIsUploadingImage(false);
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  }

  async function mutateSchedulePost(postId: string, method: "PATCH" | "DELETE", body?: Record<string, unknown>) {
    const response = await fetch(`/api/admin/schedule/${postId}`, {
      method,
      headers: body ? { "Content-Type": "application/json" } : undefined,
      body: body ? JSON.stringify(body) : undefined,
    });
    const payload = (await response.json().catch(() => ({}))) as { ok?: boolean; message?: string };
    if (!response.ok || !payload.ok) throw new Error(payload.message || "일정 변경에 실패했습니다.");
  }
```

Replace the `handleSubmit` request block with edit-aware save logic:

```tsx
      const body = {
        title,
        content,
        schedule_display_name: displayName,
        schedule_date: scheduleDate,
        schedule_start_time: scheduleStartTime,
        image_url: imageUrl,
        video_url: videoUrl,
        external_link_url: externalLinkUrl,
        published,
      };
      const response = await fetch(editingPostId ? `/api/admin/schedule/${editingPostId}` : "/api/admin/schedule", {
        method: editingPostId ? "PATCH" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const payload = (await response.json().catch(() => ({}))) as { ok?: boolean; message?: string };
      if (!response.ok || !payload.ok) throw new Error(payload.message || "정보/일정 저장에 실패했습니다.");

      resetForm();
      setState({ tone: "success", message: "정보/일정이 저장되었습니다." });
      startTransition(() => router.refresh());
```

Add the image upload control next to the image URL field:

```tsx
          <input
            ref={fileInputRef}
            type="file"
            accept="image/jpeg,image/png,image/gif,image/webp"
            disabled={isUploadingImage}
            onChange={(event) => {
              const file = event.target.files?.[0];
              if (file) void uploadImageFile(file);
            }}
            className="w-full rounded-xl border border-white/10 bg-white/[0.03] px-4 py-3 text-sm font-bold text-white/72"
          />
```

Add the publish toggle before the submit button:

```tsx
        <label className="flex items-center gap-3 rounded-xl border border-white/8 bg-white/[0.02] px-4 py-3 text-sm font-bold text-white/72">
          <input type="checkbox" checked={published} onChange={(event) => setPublished(event.target.checked)} />
          일정 페이지와 게시판에 공개
        </label>
```

Replace each existing-post card in the sidebar with action buttons:

```tsx
            <div key={post.id} className="rounded-xl border border-white/8 bg-black/15 p-3">
              <div className="text-sm font-black text-white">{post.title}</div>
              <div className="mt-1 text-xs font-bold text-white/48">
                {post.schedule_date || "-"} {post.schedule_start_time || "시간 미정"} · {post.published === false ? "비공개" : "공개"}
              </div>
              <div className="mt-3 flex flex-wrap gap-2">
                <button type="button" onClick={() => fillFromPost(post)} className="rounded-lg border border-white/10 px-3 py-2 text-xs font-black text-white/70">
                  수정
                </button>
                <button
                  type="button"
                  onClick={async () => {
                    await mutateSchedulePost(post.id, "PATCH", {
                      title: post.title,
                      content: post.content,
                      schedule_display_name: post.schedule_display_name,
                      schedule_date: post.schedule_date,
                      schedule_start_time: post.schedule_start_time,
                      image_url: post.image_url,
                      video_url: post.video_url,
                      external_link_url: post.external_link_url,
                      published: post.published === false,
                    });
                    startTransition(() => router.refresh());
                  }}
                  className="rounded-lg border border-white/10 px-3 py-2 text-xs font-black text-white/70"
                >
                  {post.published === false ? "공개" : "비공개"}
                </button>
                <button
                  type="button"
                  onClick={async () => {
                    await mutateSchedulePost(post.id, "DELETE");
                    startTransition(() => router.refresh());
                  }}
                  className="rounded-lg border border-rose-400/24 px-3 py-2 text-xs font-black text-rose-200"
                >
                  삭제
                </button>
              </div>
            </div>
```

Expected: the admin page supports creating, editing, hiding/showing, deleting, and image upload for schedule posts while normal public users still cannot create `정보/일정` posts.

- [ ] **Step 7: Run green contract and type-check**

Run:

```powershell
npm.cmd run test:schedule-info-board-contract
npx.cmd tsc --noEmit
```

Expected: PASS.

- [ ] **Step 8: Commit admin UI slice**

Run:

```powershell
git add app/admin/schedule components/admin/schedule components/admin/AdminNav.tsx scripts/tools/schedule-info-board-contract.test.js
git commit -m "Add admin schedule composer"
```

Expected: one focused commit.

## Task 4: Public Schedule Page From Board Posts

**Files:**
- Create: `components/schedule/ScheduleInfoList.tsx`
- Modify: `app/schedule/page.tsx`
- Create: `scripts/tools/schedule-info-page-contract.test.js`
- Modify: `scripts/tools/schedule-page-data-source-contract.test.js`
- Modify: `package.json`

- [ ] **Step 1: Write the failing schedule-page contract**

Create `scripts/tools/schedule-info-page-contract.test.js`:

```js
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");

const repoRoot = path.resolve(__dirname, "..", "..");

function readProjectFile(filePath) {
  return fs.readFileSync(path.join(repoRoot, filePath), "utf8");
}

test("public schedule page uses schedule info board posts instead of prediction fixtures", () => {
  const source = readProjectFile("app/schedule/page.tsx");

  assert.match(source, /listScheduleInfoPosts/);
  assert.match(source, /ScheduleInfoList/);
  assert.doesNotMatch(source, /buildTournamentPredictionMatches/);
  assert.doesNotMatch(source, /loadPredictionState/);
});

test("schedule info list renders inline details and untimed group", () => {
  const source = readProjectFile("components/schedule/ScheduleInfoList.tsx");

  assert.match(source, /"use client"/);
  assert.match(source, /todayKey/);
  assert.match(source, /filterMode/);
  assert.match(source, /오늘/);
  assert.match(source, /내일/);
  assert.match(source, /7일/);
  assert.match(source, /시간 미정/);
  assert.match(source, /정보\/일정/);
  assert.match(source, /details/);
  assert.match(source, /summary/);
  assert.doesNotMatch(source, /iframe/);
  assert.doesNotMatch(source, /<img/);
});
```

- [ ] **Step 2: Add npm script**

In `package.json`, add:

```json
"test:schedule-info-page-contract": "node scripts/tools/schedule-info-page-contract.test.js"
```

Also add both new schedule contracts to `verify:predeploy` after `test:schedule-page-data-source-contract`:

```json
"npm run test:schedule-info-board-contract && npm run test:schedule-info-page-contract"
```

- [ ] **Step 3: Update the old schedule data-source contract**

Change `scripts/tools/schedule-page-data-source-contract.test.js` so the first test asserts board post source:

```js
test("schedule page builds public schedule from admin schedule board posts", () => {
  const source = readProjectFile("app/schedule/page.tsx");

  assert.match(source, /listScheduleInfoPosts/);
  assert.doesNotMatch(source, /buildTournamentPredictionMatches/);
  assert.doesNotMatch(source, /loadPredictionState/);
});
```

Keep the local placeholder fixture test.

- [ ] **Step 4: Run red tests**

Run:

```powershell
npm.cmd run test:schedule-info-page-contract
npm.cmd run test:schedule-page-data-source-contract
```

Expected: FAIL because `/schedule` still uses prediction state.

- [ ] **Step 5: Create the schedule list component**

Create `components/schedule/ScheduleInfoList.tsx`:

```tsx
"use client";

import Link from "next/link";
import { useMemo, useState } from "react";

import { renderBoardContentToHtml } from "@/lib/board-content";
import type { BoardPostRow } from "@/lib/board";

type ScheduleInfoListProps = {
  posts: BoardPostRow[];
  todayKey: string;
};

function formatScheduleDate(value: string | null) {
  if (!value) return "";
  const date = new Date(`${value}T00:00:00+09:00`);
  return new Intl.DateTimeFormat("ko-KR", {
    month: "long",
    day: "numeric",
    weekday: "long",
    timeZone: "Asia/Seoul",
  }).format(date);
}

type FilterMode = "all" | "today" | "tomorrow" | "week";

function addDaysToDateKey(value: string, days: number) {
  const date = new Date(`${value}T00:00:00+09:00`);
  date.setDate(date.getDate() + days);
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Seoul",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(date);
}

function isPostVisibleForFilter(post: BoardPostRow, filterMode: FilterMode, todayKey: string) {
  const scheduleDate = post.schedule_date || "";
  if (filterMode === "all") return true;
  if (filterMode === "today") return scheduleDate === todayKey;
  if (filterMode === "tomorrow") return scheduleDate === addDaysToDateKey(todayKey, 1);
  return scheduleDate >= todayKey && scheduleDate <= addDaysToDateKey(todayKey, 6);
}

function groupPosts(posts: BoardPostRow[]) {
  const timed = posts.filter((post) => post.schedule_start_time);
  const untimed = posts.filter((post) => !post.schedule_start_time);
  return { timed, untimed };
}

export function ScheduleInfoList({ posts, todayKey }: ScheduleInfoListProps) {
  const [filterMode, setFilterMode] = useState<FilterMode>("all");
  const filteredPosts = useMemo(
    () => posts.filter((post) => isPostVisibleForFilter(post, filterMode, todayKey)),
    [filterMode, posts, todayKey]
  );

  if (!posts.length) {
    return (
      <div className="rounded-[1.4rem] border border-dashed border-white/12 bg-white/[0.02] px-5 py-16 text-center">
        <p className="text-sm font-medium text-white/55">예정된 경기가 없습니다.</p>
      </div>
    );
  }

  const byDate = new Map<string, BoardPostRow[]>();
  for (const post of filteredPosts) {
    const key = post.schedule_date || "";
    if (!key) continue;
    byDate.set(key, [...(byDate.get(key) || []), post]);
  }

  return (
    <div className="space-y-8">
      <div className="flex flex-wrap gap-2">
        {[
          ["all", "전체"],
          ["today", "오늘"],
          ["tomorrow", "내일"],
          ["week", "7일"],
        ].map(([value, label]) => (
          <button
            key={value}
            type="button"
            onClick={() => setFilterMode(value as FilterMode)}
            className={
              filterMode === value
                ? "rounded-xl bg-white px-4 py-2 text-sm font-black text-black"
                : "rounded-xl border border-white/10 bg-white/[0.03] px-4 py-2 text-sm font-black text-white/68"
            }
          >
            {label}
          </button>
        ))}
      </div>
      {filteredPosts.length === 0 ? (
        <div className="rounded-[1.4rem] border border-dashed border-white/12 bg-white/[0.02] px-5 py-12 text-center">
          <p className="text-sm font-medium text-white/55">선택한 기간에 등록된 정보/일정이 없습니다.</p>
        </div>
      ) : null}
      {Array.from(byDate.entries()).map(([date, datePosts]) => {
        const { timed, untimed } = groupPosts(datePosts);
        return (
          <section key={date} className="space-y-3">
            <div className="sticky top-20 z-10 inline-flex rounded-full border border-white/10 bg-card/90 px-4 py-2 text-sm font-black text-white shadow-sm backdrop-blur">
              {formatScheduleDate(date)}
            </div>
            <div className="space-y-3">
              {timed.map((post) => (
                <ScheduleInfoCard key={post.id} post={post} />
              ))}
              {untimed.length ? (
                <div className="pt-2">
                  <div className="mb-2 px-1 text-xs font-black text-white/52">시간 미정</div>
                  <div className="space-y-3">
                    {untimed.map((post) => (
                      <ScheduleInfoCard key={post.id} post={post} />
                    ))}
                  </div>
                </div>
              ) : null}
            </div>
          </section>
        );
      })}
    </div>
  );
}

function ScheduleInfoCard({ post }: { post: BoardPostRow }) {
  const timeText = post.schedule_start_time ? `${post.schedule_start_time.slice(0, 5)} 시작` : "시간 미정";
  const renderedContent = renderBoardContentToHtml(post.content);

  return (
    <details className="group overflow-hidden rounded-[1.1rem] border border-white/10 bg-card/55 transition hover:border-nzu-green/35">
      <summary className="grid cursor-pointer grid-cols-[4.75rem_minmax(0,1fr)_auto] items-center gap-3 px-4 py-3 marker:content-none">
        <div className="flex min-h-[3.75rem] w-[4.25rem] flex-col items-center justify-center rounded-xl border border-sky-300/45 bg-black/20 px-2 text-center">
          <strong className="max-w-full truncate text-sm font-black text-white">{post.schedule_display_name}</strong>
          <span className="mt-1 text-[10px] font-black text-white/42">일정</span>
        </div>
        <div className="min-w-0">
          <div className="truncate text-base font-black tracking-tight text-white">{post.title}</div>
          <div className="mt-2 flex flex-wrap items-center gap-2 text-xs font-bold text-white/50">
            <span className="rounded-full bg-sky-400/12 px-2 py-1 text-sky-100">정보/일정</span>
            <span>{timeText}</span>
          </div>
        </div>
        <span className="text-xl text-white/38 transition group-open:rotate-180">⌄</span>
      </summary>
      <div className="border-t border-white/8 px-4 py-4 md:pl-[6.25rem]">
        <div
          className="max-w-none space-y-2 text-sm font-medium leading-7 text-white/72 [&_a]:font-bold [&_a]:text-nzu-green [&_p]:my-0"
          dangerouslySetInnerHTML={{ __html: renderedContent }}
        />
        <div className="mt-4 flex flex-wrap gap-2">
          {post.external_link_url ? (
            <a href={post.external_link_url} className="inline-flex min-h-10 items-center rounded-xl bg-nzu-green px-4 text-xs font-black text-black" target="_blank" rel="noreferrer">
              링크 열기
            </a>
          ) : null}
          <Link href={`/board/${post.id}`} className="inline-flex min-h-10 items-center rounded-xl border border-white/12 bg-white/[0.04] px-4 text-xs font-black text-white">
            게시글 자세히 보기
          </Link>
        </div>
      </div>
    </details>
  );
}
```

- [ ] **Step 6: Replace `/schedule` data source**

In `app/schedule/page.tsx`, remove imports for `playerService`, `loadPredictionState`, `buildTournamentPredictionMatches`, `format`, and `ko`.

Replace with:

```tsx
import { ScheduleInfoList } from "@/components/schedule/ScheduleInfoList";
import { listScheduleInfoPosts } from "@/lib/board";
```

Use:

```tsx
export const revalidate = 300;

function toKstDateKey(date: Date) {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Seoul",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(date);
}

function addDays(date: Date, days: number) {
  const next = new Date(date);
  next.setDate(next.getDate() + days);
  return next;
}
```

Inside the page:

```tsx
const today = new Date();
const fromDate = toKstDateKey(today);
const toDate = toKstDateKey(addDays(today, 60));
const schedule = await listScheduleInfoPosts({ fromDate, toDate, limit: 100 });
```

Render:

```tsx
<ScheduleInfoList posts={schedule.posts} todayKey={fromDate} />
```

Keep existing locked labels:

- `공식 경기 일정 안내`
- `예정된 경기가 없습니다.`

Do not rename navigation labels.

- [ ] **Step 7: Run green tests**

Run:

```powershell
npm.cmd run test:schedule-info-page-contract
npm.cmd run test:schedule-page-data-source-contract
npm.cmd run test:schedule-info-board-contract
```

Expected: all pass.

- [ ] **Step 8: Type-check and build**

Run:

```powershell
npx.cmd tsc --noEmit
npm.cmd run build
```

Expected: PASS.

- [ ] **Step 9: Commit public schedule slice**

Run:

```powershell
git add app/schedule/page.tsx components/schedule scripts/tools/schedule-info-page-contract.test.js scripts/tools/schedule-page-data-source-contract.test.js package.json
git commit -m "Render schedule from info board posts"
```

Expected: one focused commit.

## Task 5: Board Display And Detail Link Support

**Files:**
- Modify: `app/board/page.tsx`
- Modify: `app/board/[id]/page.tsx`
- Modify: `app/api/board/[id]/route.ts`
- Modify: `scripts/tools/schedule-info-board-contract.test.js`

- [ ] **Step 1: Extend board display contract**

Append:

```js
test("board list and detail expose info schedule label and external schedule links", () => {
  const listPage = readProjectFile("app/board/page.tsx");
  const detailPage = readProjectFile("app/board/[id]/page.tsx");
  const mutationRoute = readProjectFile("app/api/board/[id]/route.ts");

  assert.match(listPage, /getBoardCategoryLabel/);
  assert.match(detailPage, /external_link_url/);
  assert.match(detailPage, /링크 열기/);
  assert.match(mutationRoute, /context\.post\.category === "schedule"/);
  assert.match(mutationRoute, /revalidatePath\("\/schedule"\)/);
});
```

- [ ] **Step 2: Run red test**

Run:

```powershell
npm.cmd run test:schedule-info-board-contract
```

Expected: FAIL because board detail does not render `external_link_url`, and the generic board mutation route does not revalidate `/schedule` when schedule posts are edited or deleted there.

- [ ] **Step 3: Render external schedule link on board detail**

In `app/board/[id]/page.tsx`, after video/image sections and before `download_url`, add:

```tsx
{post.external_link_url ? (
  <div className="mt-6">
    <a
      href={post.external_link_url}
      target="_blank"
      rel="noreferrer"
      className="inline-flex min-h-11 items-center justify-center rounded-xl border border-nzu-green/30 bg-nzu-green/10 px-5 text-sm font-black text-nzu-green transition hover:bg-nzu-green hover:text-black"
    >
      링크 열기
    </a>
  </div>
) : null}
```

- [ ] **Step 4: Revalidate `/schedule` from the generic board mutation route**

In `app/api/board/[id]/route.ts`, after the existing board revalidation calls inside both `PATCH` and `DELETE`, add:

```ts
    if (context.post.category === "schedule") {
      revalidatePath("/schedule");
    }
```

Expected: if a schedule post is edited or deleted through the existing board detail/edit controls, the schedule page cache is invalidated too.

- [ ] **Step 5: Run board tests**

Run:

```powershell
npm.cmd run test:schedule-info-board-contract
npm.cmd run test:board-readability-contract
npm.cmd run test:board-write-contract
npm.cmd run test:board-edit-contract
```

Expected: PASS.

- [ ] **Step 6: Commit board display slice**

Run:

```powershell
git add app/board/page.tsx app/board/[id]/page.tsx app/api/board/[id]/route.ts scripts/tools/schedule-info-board-contract.test.js
git commit -m "Show info schedule board links"
```

Expected: one focused commit.

## Task 6: Verification And Active Plan Update

**Files:**
- Modify: `docs/harness/exec-plans/active/2026-05-13-schedule-info-board.md`

- [ ] **Step 1: Run focused tests**

Run:

```powershell
npm.cmd run test:schedule-info-board-contract
npm.cmd run test:schedule-info-page-contract
npm.cmd run test:schedule-page-data-source-contract
npm.cmd run test:board-write-contract
npm.cmd run test:board-edit-contract
npm.cmd run test:board-readability-contract
npx.cmd tsc --noEmit
npm.cmd run build
npm.cmd run lint
```

Expected: all pass.

- [ ] **Step 2: Run pipeline health**

Run:

```powershell
npm.cmd run pipeline:health
```

Expected: PASS.

- [ ] **Step 3: Run predeploy if health passes**

Run:

```powershell
npm.cmd run verify:predeploy
```

Expected: PASS.

- [ ] **Step 4: Browser verify local**

Start dev server:

```powershell
npm.cmd run dev
```

Check:

```powershell
agent-browser.cmd open http://localhost:3000/schedule
agent-browser.cmd set viewport 390 844
agent-browser.cmd open http://localhost:3000/schedule
agent-browser.cmd set viewport 1440 1000
agent-browser.cmd open http://localhost:3000/schedule
agent-browser.cmd open http://localhost:3000/admin/schedule
agent-browser.cmd errors
```

Expected:

- `/schedule` renders no horizontal overflow.
- Empty state uses `예정된 경기가 없습니다.` when no schedule posts exist.
- `/admin/schedule` redirects to admin login if not logged in.
- No browser console errors.

- [ ] **Step 5: Record verification**

Update `docs/harness/exec-plans/active/2026-05-13-schedule-info-board.md` with exact commands and results.

- [ ] **Step 6: Commit verification docs**

Run:

```powershell
git add docs/harness/exec-plans/active/2026-05-13-schedule-info-board.md
git commit -m "Record schedule info board verification"
```

Expected: one docs commit.

## Final Notes

- This plan intentionally does not apply SQL to production.
- After code is merged and verified, production DB migration must be explicitly approved and run as a separate ops step.
- If the existing Supabase schema lacks the new columns, deployed admin schedule writes will fail until the SQL is applied. That is expected before the approved DB migration.
