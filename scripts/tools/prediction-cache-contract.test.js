const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");

const repoRoot = path.resolve(__dirname, "..", "..");

function readProjectFile(filePath) {
  return fs.readFileSync(path.join(repoRoot, filePath), "utf8");
}

test("prediction public page and API use cached player list reads", () => {
  const pageSource = readProjectFile("app/prediction/page.tsx");
  const apiSource = readProjectFile("app/api/prediction/route.ts");

  assert.match(pageSource, /playerService\.getCachedPlayersList\(\)/);
  assert.doesNotMatch(pageSource, /playerService\.getAllPlayers\(\)/);

  assert.match(apiSource, /playerService\.getCachedPlayersList\(\)/);
  assert.doesNotMatch(apiSource, /playerService\.getAllPlayers\(\)/);
});
