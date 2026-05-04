const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");

const repoRoot = path.resolve(__dirname, "..", "..");

const clientCacheFiles = [
  {
    label: "entry H2H lookup",
    filePath: "components/stats/H2HLookup.tsx",
  },
  {
    label: "tier H2H selector",
    filePath: "components/players/H2HSelectorBar.tsx",
  },
];

function readProjectFile(filePath) {
  return fs.readFileSync(path.join(repoRoot, filePath), "utf8");
}

test("client H2H request caches keep zero-sample results but drop failed requests", () => {
  for (const { label, filePath } of clientCacheFiles) {
    const source = readProjectFile(filePath);

    assert.doesNotMatch(
      source,
      /summary\?\.total[\s\S]{0,120}delete\(queryKey\)/,
      `${label} should not delete a successful zero-sample H2H response from the request cache`
    );
    assert.match(
      source,
      /promise\.catch\(\(\)\s*=>\s*{[\s\S]{0,120}delete\(queryKey\)/,
      `${label} should still evict failed H2H requests so retries can recover`
    );
    assert.match(
      source,
      /if\s*\(!payload\)\s*{[\s\S]{0,120}delete\(queryKey\)/,
      `${label} should evict null H2H payloads so transient bad responses can be retried`
    );
  }
});
