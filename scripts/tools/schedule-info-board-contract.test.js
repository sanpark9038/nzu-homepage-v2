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
