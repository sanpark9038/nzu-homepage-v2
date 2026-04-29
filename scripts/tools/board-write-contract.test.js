const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");

const repoRoot = path.resolve(__dirname, "..", "..");

function readProjectFile(filePath) {
  return fs.readFileSync(path.join(repoRoot, filePath), "utf8");
}

test("board composer does not collect or submit download URLs for new posts", () => {
  const composer = readProjectFile("components/board/BoardPostComposer.tsx");

  assert.equal(composer.includes("downloadUrl"), false);
  assert.equal(composer.includes("download_url"), false);
});

test("board post API ignores body-supplied download URLs for new public posts", () => {
  const route = readProjectFile("app/api/board/route.ts");

  assert.match(route, /download_url:\s*null/);
});

test("board writing keeps short content easy to submit", () => {
  const board = readProjectFile("lib/board.ts");

  assert.equal(board.includes("content.length < 10"), false);
});

test("board list dates are formatted in Korea time", () => {
  const boardPage = readProjectFile("app/board/page.tsx");

  assert.match(boardPage, /timeZone\s*=\s*"Asia\/Seoul"/);
  assert.match(boardPage, /hour12:\s*false/);
});

test("board image preview stays compact and media inputs align", () => {
  const composer = readProjectFile("components/board/BoardPostComposer.tsx");

  assert.match(composer, /flex min-h-9 items-center justify-between/);
  assert.match(composer, /flex min-h-9 items-center">영상 URL/);
  assert.match(composer, /max-w-sm overflow-hidden/);
  assert.match(composer, /max-h-40 w-full object-contain/);
  assert.equal(composer.includes("max-h-56 w-full object-contain"), false);
});
