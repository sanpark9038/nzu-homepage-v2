const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");

const repoRoot = path.resolve(__dirname, "..", "..");

function readProjectFile(filePath) {
  return fs.readFileSync(path.join(repoRoot, filePath), "utf8");
}

test("board post delete API allows admins or the original author only", () => {
  const route = readProjectFile("app/api/board/[id]/route.ts");

  assert.match(route, /export async function DELETE/);
  assert.match(route, /ADMIN_SESSION_COOKIE/);
  assert.match(route, /isValidAdminSession/);
  assert.match(route, /PUBLIC_AUTH_SESSION_COOKIE/);
  assert.match(route, /parsePublicAuthSessionCookieValue/);
  assert.match(route, /postAuthorProviderUserId/);
  assert.match(route, /deleteBoardPostById/);
});

test("board post delete API attempts to remove owned R2 board images", () => {
  const route = readProjectFile("app/api/board/[id]/route.ts");
  const helper = readProjectFile("lib/r2.ts");

  assert.match(route, /deleteBoardImageFromR2/);
  assert.match(route, /R2 image delete failed after post delete/);
  assert.match(helper, /DeleteObjectCommand/);
  assert.match(helper, /getBoardImageObjectKeyFromPublicUrl/);
  assert.match(helper, /key\.startsWith\("board\/"\)/);
});

test("board detail page only renders the delete control when allowed", () => {
  const detailPage = readProjectFile("app/board/[id]/page.tsx");
  const deleteButton = readProjectFile("components/board/BoardPostDeleteButton.tsx");

  assert.match(detailPage, /BoardPostDeleteButton/);
  assert.match(detailPage, /const canEdit/);
  assert.match(detailPage, /session\.providerUserId === post\.author_provider_user_id/);
  assert.match(deleteButton, /method:\s*"DELETE"/);
  assert.match(deleteButton, /window\.confirm/);
  assert.match(deleteButton, /router\.replace\("\/board"\)/);
});
