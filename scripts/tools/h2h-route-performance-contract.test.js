const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");

const repoRoot = path.resolve(__dirname, "..", "..");

function readProjectFile(filePath) {
  return fs.readFileSync(path.join(repoRoot, filePath), "utf8");
}

test("H2H route checks ID-based detailed stats before expanding history name candidates", () => {
  const source = readProjectFile("app/api/stats/h2h/route.ts");
  const detailedStatsIndex = source.indexOf("playerService.getDetailedH2HStats");
  const nameCandidatesIndex = source.indexOf("playerService.getH2HNameCandidatesByIds");

  assert.notEqual(detailedStatsIndex, -1);
  assert.notEqual(nameCandidatesIndex, -1);
  assert.ok(
    detailedStatsIndex < nameCandidatesIndex,
    "ID-based H2H stats should run before history-name expansion to avoid duplicate R2 artifact fetches"
  );
});
