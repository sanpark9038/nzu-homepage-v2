const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");

const repoRoot = path.resolve(__dirname, "..", "..");

function readProjectFile(filePath) {
  return fs.readFileSync(path.join(repoRoot, filePath), "utf8");
}

test("tier page reads fresh player serving state instead of cached public player list", () => {
  const source = readProjectFile("app/tier/page.tsx");

  assert.match(source, /export\s+const\s+dynamic\s*=\s*"force-dynamic"/);
  assert.match(source, /export\s+const\s+revalidate\s*=\s*0/);
  assert.match(source, /playerService\.getAllPlayers\(\)/);
  assert.doesNotMatch(source, /playerService\.getCachedPlayersList\(\)/);
});
