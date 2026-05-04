const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");

const repoRoot = path.resolve(__dirname, "..", "..");

function readProjectFile(filePath) {
  return fs.readFileSync(path.join(repoRoot, filePath), "utf8");
}

test("player history artifact reads use the public player-history cache tag", () => {
  const source = readProjectFile("lib/player-history-artifacts.ts");

  assert.match(
    source,
    /import\s*{\s*unstable_cache\s*}\s*from\s*["']next\/cache["']/,
    "Player history artifact reads should use Next.js unstable_cache"
  );
  assert.match(
    source,
    /const\s+loadCachedPlayerHistoryArtifact\s*=\s*unstable_cache\(/,
    "Artifact reads should be wrapped in a named cache helper"
  );
  assert.match(
    source,
    /revalidate:\s*300/,
    "Artifact cache should use the same short 300 second freshness window as public player history"
  );
  assert.match(
    source,
    /tags:\s*\[\s*["']public-player-history["']\s*\]/,
    "Artifact cache should share the public-player-history invalidation tag"
  );
  assert.match(
    source,
    /const\s+remote\s*=\s*await\s+loadCachedPlayerHistoryArtifact\(key\)/,
    "Public history lookup should read through the cached artifact helper"
  );
});
