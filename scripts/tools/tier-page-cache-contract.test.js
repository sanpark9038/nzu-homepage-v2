const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");

const repoRoot = path.resolve(__dirname, "..", "..");

function readProjectFile(filePath) {
  return fs.readFileSync(path.join(repoRoot, filePath), "utf8");
}

test("tier page uses cached full-list reads and a filtered live-only query", () => {
  const source = readProjectFile("app/tier/page.tsx");

  assert.match(source, /export\s+const\s+dynamic\s*=\s*"force-dynamic"/);
  assert.match(source, /export\s+const\s+revalidate\s*=\s*0/);
  assert.match(source, /playerService\.getCachedPlayersList\(\)/);
  assert.match(source, /playerService\.getLivePlayers\(\)/);
  assert.doesNotMatch(source, /playerService\.getAllPlayers\(\)/);
  assert.match(
    source,
    /liveOnly\s*\?\s*playerService\.getLivePlayers\(\)\s*:\s*playerService\.getCachedPlayersList\(\)/s
  );
});
