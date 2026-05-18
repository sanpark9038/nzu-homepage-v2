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
