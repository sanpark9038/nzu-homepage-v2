const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");

const repoRoot = path.resolve(__dirname, "..", "..");

function readProjectFile(filePath) {
  return fs.readFileSync(path.join(repoRoot, filePath), "utf8");
}

test("board post edit API patches only public editable fields", () => {
  const route = readProjectFile("app/api/board/[id]/route.ts");
  const board = readProjectFile("lib/board.ts");

  assert.match(route, /export async function PATCH/);
  assert.match(route, /normalizeBoardPostUpdateInput/);
  assert.match(route, /validateBoardPostUpdateInput/);
  assert.match(route, /updateBoardPostById/);
  assert.match(board, /Pick<BoardPostUpdate,\s*"title"\s*\|\s*"content"\s*\|\s*"image_url"\s*\|\s*"video_url">/);
  assert.equal(route.includes("author_name:"), false);
  assert.equal(route.includes("category:"), false);
  assert.equal(route.includes("download_url:"), false);
});

test("board post edit uses the same admin-or-author permission gate as delete", () => {
  const route = readProjectFile("app/api/board/[id]/route.ts");
  const detailPage = readProjectFile("app/board/[id]/page.tsx");
  const editPage = readProjectFile("app/board/[id]/edit/page.tsx");

  assert.match(route, /canMutateBoardPost/);
  assert.match(route, /ADMIN_SESSION_COOKIE/);
  assert.match(route, /PUBLIC_AUTH_SESSION_COOKIE/);
  assert.match(route, /sessionProviderUserId === postAuthorProviderUserId/);
  assert.match(detailPage, /\/board\/\$\{post\.id\}\/edit/);
  assert.match(editPage, /const canEdit/);
  assert.match(editPage, /session\.providerUserId === post\.author_provider_user_id/);
});

test("board post edit form can replace or clear image and video fields", () => {
  const form = readProjectFile("components/board/BoardPostEditForm.tsx");

  assert.match(form, /method:\s*"PATCH"/);
  assert.match(form, /\/api\/board\/\$\{encodeURIComponent\(post\.id\)\}/);
  assert.match(form, /image_url:\s*imageUrl/);
  assert.match(form, /video_url:\s*videoUrl/);
  assert.match(form, /\/api\/board\/images/);
  assert.match(form, /setImageUrl\(""\)/);
  assert.match(form, /router\.replace\(`\/board\/\$\{post\.id\}`\)/);
});
