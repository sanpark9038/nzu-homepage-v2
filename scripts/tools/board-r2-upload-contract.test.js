const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");

const repoRoot = path.resolve(__dirname, "..", "..");

function readProjectFile(filePath) {
  return fs.readFileSync(path.join(repoRoot, filePath), "utf8");
}

test("board image upload API is login gated and delegates to the R2 helper", () => {
  const route = readProjectFile("app/api/board/images/route.ts");

  assert.match(route, /PUBLIC_AUTH_SESSION_COOKIE/);
  assert.match(route, /parsePublicAuthSessionCookieValue/);
  assert.match(route, /req\.formData\(\)/);
  assert.match(route, /content-length/i);
  assert.match(route, /assertBoardImageUploadRateLimit/);
  assert.match(route, /uploadBoardImageToR2/);
});

test("R2 helper validates board image limits before upload", () => {
  const helper = readProjectFile("lib/r2.ts");

  assert.match(helper, /R2_ACCOUNT_ID/);
  assert.match(helper, /R2_ACCESS_KEY_ID/);
  assert.match(helper, /R2_SECRET_ACCESS_KEY/);
  assert.match(helper, /R2_BUCKET_NAME/);
  assert.match(helper, /R2_PUBLIC_BASE_URL/);
  assert.match(helper, /5\s*\*\s*1024\s*\*\s*1024/);

  for (const mime of ["image/jpeg", "image/png", "image/gif", "image/webp"]) {
    assert.match(helper, new RegExp(mime));
  }
});

test("board composer uploads selected or pasted images without exposing R2 secrets", () => {
  const composer = readProjectFile("components/board/BoardPostComposer.tsx");

  assert.match(composer, /\/api\/board\/images/);
  assert.match(composer, /FormData/);
  assert.match(composer, /onPaste=/);
  assert.match(composer, /activeImageUploadIdRef/);
  assert.match(composer, /isPreviewableImageUrl/);
  assert.match(composer, /aria-label="이미지 URL"/);
  assert.match(composer, /accept="image\/jpeg,image\/png,image\/gif,image\/webp"/);
  assert.equal(composer.includes("R2_SECRET_ACCESS_KEY"), false);
  assert.equal(composer.includes("R2_ACCESS_KEY_ID"), false);
});
