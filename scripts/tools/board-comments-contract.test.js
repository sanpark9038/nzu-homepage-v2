const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const ROOT = path.resolve(__dirname, "..", "..");
const PUBLIC_HREF_SCAN_EXCLUDES = new Set([
  path.join("app", "api"),
  path.join("app", "board", "query"),
  path.join("app", "player", "query"),
]);

function read(relativePath) {
  return fs.readFileSync(path.join(ROOT, relativePath), "utf8");
}

function isExcludedSource(relativePath, excludes) {
  return Array.from(excludes).some((excluded) => relativePath === excluded || relativePath.startsWith(`${excluded}${path.sep}`));
}

function listSourceFiles(relativeDir, excludes = new Set()) {
  if (isExcludedSource(relativeDir, excludes)) return [];
  const root = path.join(ROOT, relativeDir);
  if (!fs.existsSync(root)) return [];
  const entries = fs.readdirSync(root, { withFileTypes: true });
  return entries.flatMap((entry) => {
    const relativePath = path.join(relativeDir, entry.name);
    if (entry.isDirectory()) return listSourceFiles(relativePath, excludes);
    return /\.(ts|tsx)$/.test(entry.name) ? [relativePath] : [];
  });
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
  assert.match(sql, /grant select on table public\.board_comments to anon, authenticated/);
  assert.match(sql, /grant select, insert, update, delete on table public\.board_comments to service_role/);
  assert.match(sql, /create or replace function public\.board_visible_comment_counts\(post_ids uuid\[\]\)/);
  assert.match(sql, /returns table \(post_id uuid, comment_count bigint\)/);
  assert.match(sql, /security invoker/);
  assert.match(sql, /count\(\*\)::bigint/);
  assert.match(sql, /group by c\.post_id/);
  assert.match(sql, /grant execute on function public\.board_visible_comment_counts\(uuid\[\]\) to anon, authenticated, service_role/);
  assert.match(sql, /notify pgrst, 'reload schema'/);
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
  assert.match(source, /getVisibleBoardCommentCountsFromRpc/);
  assert.match(source, /getVisibleBoardCommentCountsFromRows/);
  assert.match(source, /\.rpc\("board_visible_comment_counts"/);
  assert.match(source, /isBoardCommentCountsRpcMissing/);
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

test("board base menu route is cacheable while query URLs keep filters and status messages", () => {
  const page = read("app/board/page.tsx");
  const queryPage = read("app/board/query/page.tsx");
  const authStartRoute = read("app/api/auth/soop/start/route.ts");
  const authLogoutRoute = read("app/api/auth/soop/logout/route.ts");
  const boardDownloadRoute = read("app/api/board/download/route.ts");
  const proxy = read("proxy.ts");

  assert.doesNotMatch(page, /searchParams/);
  assert.match(page, /export\s+const\s+revalidate\s*=\s*30/);
  assert.match(page, /getCachedBoardPostsWithCommentCounts\(20,\s*"all"\)/);
  assert.doesNotMatch(page, /params\.login|params\.download|normalizeBoardListFilter\(params\.filter\)/);
  assert.match(page, /filter === "all" \? "\/board" : `\/board\?filter=\$\{filter\}`/);

  assert.match(queryPage, /searchParams/);
  assert.match(queryPage, /normalizeBoardListFilter\(params\.filter\)/);
  assert.match(queryPage, /loginStatus/);
  assert.match(queryPage, /downloadStatus/);
  assert.match(queryPage, /getCachedBoardPostsWithCommentCounts\(20,\s*boardFilter\)/);

  assert.match(authStartRoute, /\/board\?login=soop-not-configured/);
  assert.match(authLogoutRoute, /\/board\?login=logged-out/);
  assert.match(boardDownloadRoute, /\?download=missing/);
  assert.match(boardDownloadRoute, /\?download=invalid/);

  assert.match(proxy, /if\s*\(pathname === "\/board"\)\s*\{[\s\S]*?rewriteUrl\.pathname\s*=\s*"\/board\/query"/);
  assert.match(proxy, /source:\s*["']\/board["'],\s*has:\s*\[\{\s*type:\s*["']query["'],\s*key:\s*["']filter["']/);
  assert.match(proxy, /source:\s*["']\/board["'],\s*has:\s*\[\{\s*type:\s*["']query["'],\s*key:\s*["']login["']/);
  assert.match(proxy, /source:\s*["']\/board["'],\s*has:\s*\[\{\s*type:\s*["']query["'],\s*key:\s*["']download["']/);
  assert.doesNotMatch(proxy, /^\s*["']\/board["']\s*,?\s*$/m);
  assert.doesNotMatch(proxy, /\{\s*source:\s*["']\/board["']\s*,?\s*\}/);

  const publicSources = [...listSourceFiles("app", PUBLIC_HREF_SCAN_EXCLUDES), ...listSourceFiles("components"), "lib/navigation-config.ts"];
  for (const filePath of publicSources) {
    assert.doesNotMatch(read(filePath), /["'`]\/board\/query/, `${filePath} should not expose the internal board query route`);
  }
});

test("board list uses cached lightweight summary data and invalidates it on writes", () => {
  const board = read("lib/board.ts");
  const page = read("app/board/page.tsx");
  const boardRoute = read("app/api/board/route.ts");
  const postRoute = read("app/api/board/[id]/route.ts");
  const commentRoute = read("app/api/board/[id]/comments/route.ts");
  const commentDeleteRoute = read("app/api/board/[id]/comments/[commentId]/route.ts");
  const adminScheduleRoute = read("app/api/admin/schedule/route.ts");
  const adminScheduleIdRoute = read("app/api/admin/schedule/[id]/route.ts");

  assert.match(board, /BOARD_LIST_CACHE_TAG/);
  assert.match(board, /unstable_cache/);
  assert.match(board, /getCachedBoardPostsWithCommentCounts/);
  assert.match(board, /listBoardPostSummaries/);
  assert.match(
    board,
    /BOARD_POST_LIST_COLUMNS =\s*"id,title,author_name,created_at,category,image_url,video_url,published,schedule_date,schedule_start_time"/
  );
  assert.match(board, /\.select\(BOARD_POST_LIST_COLUMNS\)/);
  assert.match(page, /getCachedBoardPostsWithCommentCounts/);
  assert.doesNotMatch(page, /cookies\(/);
  assert.doesNotMatch(page, /PUBLIC_AUTH_SESSION_COOKIE/);

  for (const source of [boardRoute, postRoute, commentRoute, commentDeleteRoute, adminScheduleRoute, adminScheduleIdRoute]) {
    assert.match(source, /revalidateTag/);
    assert.match(source, /BOARD_LIST_CACHE_TAG/);
    assert.match(source, /revalidateTag\(BOARD_LIST_CACHE_TAG/);
  }
});

test("board all-list falls back to full rows when summary reads are unavailable", () => {
  const board = read("lib/board.ts");

  assert.match(board, /listBoardPostSummariesFromFullRows/);
  assert.match(board, /!scheduleResult\.storageReady \|\| !regularResult\.storageReady/);
  assert.match(board, /return listBoardPostSummariesFromFullRows\(limit\)/);
});

test("package exposes the board comments contract test", () => {
  const pkg = JSON.parse(read("package.json"));
  assert.equal(pkg.scripts["test:board:comments"], "node scripts/tools/board-comments-contract.test.js");
});
