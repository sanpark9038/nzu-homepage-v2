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
