const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");

const repoRoot = path.resolve(__dirname, "..", "..");

function readProjectFile(filePath) {
  return fs.readFileSync(path.join(repoRoot, filePath), "utf8");
}

test("H2H route avoids duplicate artifact-backed fallback work after ID-based detailed stats", () => {
  const source = readProjectFile("app/api/stats/h2h/route.ts");
  const detailedStatsIndex = source.indexOf("playerService.getDetailedH2HStats");

  assert.notEqual(detailedStatsIndex, -1);
  assert.doesNotMatch(
    source,
    /playerService\.getH2HNameCandidatesByIds\(/,
    "The route should not fetch history-derived name candidates after detailed ID stats already checked artifacts"
  );
  assert.match(
    source,
    /if\s*\(\s*!byIdStats\s*&&\s*!hasH2HSample\(stats\)\s*&&\s*p1Id\s*&&\s*p2Id\s*\)/,
    "Legacy ID fallback should be skipped when detailed ID stats already ran"
  );
});
