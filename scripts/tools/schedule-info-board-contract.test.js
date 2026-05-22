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

test("board list shows schedule timing as a title badge while preserving created date", () => {
  const listPage = readProjectFile("app/board/page.tsx");
  const board = readProjectFile("lib/board.ts");

  assert.match(listPage, /formatBoardScheduleBadge\(post\)/);
  assert.match(listPage, /post\.category === "schedule"/);
  assert.match(listPage, /post\.schedule_date/);
  assert.match(listPage, /post\.schedule_start_time/);
  assert.match(listPage, /const scheduleBadge = formatBoardScheduleBadge\(post\)/);
  assert.match(listPage, /\{scheduleBadge \? \(/);
  assert.match(listPage, /bg-sky-300\/\[0\.035\]/);
  assert.match(listPage, /border-sky-300\/45/);
  assert.match(listPage, /w-\[6\.9rem\]/);
  assert.match(listPage, /justify-center/);
  assert.match(listPage, /formatBoardListDate\(post\.created_at\)/);
  assert.match(board, /BOARD_POST_LIST_COLUMNS[\s\S]*schedule_date/);
  assert.match(board, /BOARD_POST_LIST_COLUMNS[\s\S]*schedule_start_time/);
});

test("board list orders schedule posts by schedule start before regular latest posts", () => {
  const board = readProjectFile("lib/board.ts");

  assert.match(board, /listBoardSchedulePostSummaries/);
  assert.match(board, /\.eq\("category", "schedule"\)/);
  assert.match(board, /\.not\("schedule_date", "is", null\)/);
  assert.match(board, /\.order\("schedule_date", \{ ascending: false/);
  assert.match(board, /\.order\("schedule_start_time", \{ ascending: true/);
  assert.match(board, /listRegularBoardPostSummaries/);
  assert.match(board, /\.or\("category\.is\.null,category\.neq\.schedule"\)/);
  assert.match(board, /\[\.\.\.scheduleResult\.posts, \.\.\.regularResult\.posts\]\.slice\(0, limit\)/);
});

test("board list exposes a past schedule tab backed by expired schedule filtering", () => {
  const board = readProjectFile("lib/board.ts");
  const listPage = readProjectFile("app/board/page.tsx");

  assert.match(board, /export type BoardListFilter = "all" \| "schedule" \| "past-schedule"/);
  assert.match(board, /normalizeBoardListFilter/);
  assert.match(board, /isPastSchedulePost/);
  assert.match(board, /listBoardSchedulePostSummaries\(limit,\s*"past"/);
  assert.match(board, /listBoardSchedulePostSummaries\(limit,\s*"active"/);
  assert.match(board, /filter === "past-schedule"/);
  assert.match(board, /filter === "schedule"/);
  assert.match(listPage, /normalizeBoardListFilter/);
  assert.match(listPage, /past-schedule/);
  assert.match(listPage, /boardFilterHref\("past-schedule"\)/);
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

test("public board creation remains unable to create schedule posts", () => {
  const route = readProjectFile("app/api/board/route.ts");

  assert.match(route, /category:\s*null/);
  assert.doesNotMatch(route, /schedule_date/);
  assert.doesNotMatch(route, /schedule_display_name/);
});

test("board helpers define admin schedule input and list helpers", () => {
  const board = readProjectFile("lib/board.ts");

  assert.match(board, /formatErrorSearchText/);
  assert.match(board, /JSON\.stringify\(error\)/);
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

  assert.match(itemRoute, /params:\s*Promise<unknown>/);
  assert.match(itemRoute, /readRouteId/);
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

test("admin schedule UI is a board-style composer with schedule fields", () => {
  const page = readProjectFile("app/admin/schedule/page.tsx");
  const composer = readProjectFile("components/admin/schedule/SchedulePostComposer.tsx");
  const adminNav = readProjectFile("components/admin/AdminNav.tsx");
  const board = readProjectFile("lib/board.ts");

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
  assert.match(composer, /window\.confirm/);
  assert.match(composer, /busyPostId/);
  assert.match(composer, /editingPostId === post\.id/);
  assert.match(composer, /if \(!editingPostId\)/);
  assert.match(composer, /toTimeInputValue\(post\.schedule_start_time\)/);
  assert.match(composer, /이미지 파일 업로드/);
  assert.match(composer, /htmlFor="schedule-image-url"/);
  assert.match(board, /published:\s*row\.published === false \? false : true/);
  assert.match(adminNav, /\/admin\/schedule/);
});

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
