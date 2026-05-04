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

  assert.doesNotMatch(
    source,
    /playerService\.getH2HNameCandidatesByIds\(/,
    "The route should not fetch history-derived name candidates after detailed ID stats already checked artifacts"
  );
  assert.doesNotMatch(
    source,
    /playerService\.getH2HStats\(/,
    "The route should not run legacy ID H2H fallback after detailed ID stats"
  );
});

test("ID-based H2H route returns detailed stats before name fallback work", () => {
  const source = readProjectFile("app/api/stats/h2h/route.ts");
  const detailedStatsIndex = source.indexOf("playerService.getDetailedH2HStats");
  const cachedPlayersIndex = source.indexOf("playerService.getCachedPlayersList");
  const instantH2HIndex = source.indexOf("await getInstantH2H");

  assert.notEqual(detailedStatsIndex, -1, "Route should call detailed ID H2H stats");
  assert.notEqual(cachedPlayersIndex, -1, "Route should keep cached player lookup for name-only fallback");
  assert.notEqual(instantH2HIndex, -1, "Route should keep instant H2H for name-only fallback");
  assert.ok(
    detailedStatsIndex < cachedPlayersIndex,
    "ID-based detailed stats should run before loading the cached full player list"
  );
  assert.ok(
    detailedStatsIndex < instantH2HIndex,
    "ID-based detailed stats should run before trying name-based instant H2H"
  );
  assert.match(
    source,
    /if\s*\(\s*p1Id\s*&&\s*p2Id\s*\)\s*{[\s\S]*?const\s+byIdStats\s*=\s*await\s+playerService\.getDetailedH2HStats\(p1Id,\s*p2Id\)[\s\S]*?return\s+NextResponse\.json\(byIdStats\)/,
    "ID-based requests should return the detailed ID result directly, including zero-sample stats"
  );
});

test("Detailed H2H loads the second player history artifact only as reciprocal fallback", () => {
  const source = readProjectFile("lib/player-service.ts");
  const methodStart = source.indexOf("async getDetailedH2HStats");
  const methodEnd = source.indexOf("async getH2HNameCandidatesByIds", methodStart);
  const methodSource = source.slice(methodStart, methodEnd);

  assert.notEqual(methodStart, -1, "Player service should expose getDetailedH2HStats");
  assert.notEqual(methodEnd, -1, "Test should isolate getDetailedH2HStats");
  assert.doesNotMatch(
    methodSource,
    /Promise\.all\(\s*\[[\s\S]*?mergePlayerHistoryArtifact\(p1\)[\s\S]*?mergePlayerHistoryArtifact\(p2\)[\s\S]*?\]\s*\)/,
    "Detailed H2H should not always load both player history artifacts"
  );
  assert.match(
    methodSource,
    /const\s+p1WithArtifactHistory\s*=\s*await\s+mergePlayerHistoryArtifact\(p1\)/,
    "Detailed H2H should load P1 history first"
  );
  assert.match(
    methodSource,
    /let\s+historyEntries\s*=\s*buildDetailedHistoryEntries\(p1WithArtifactHistory,\s*p2\)/,
    "Detailed H2H should first build entries from P1 history"
  );
  assert.match(
    methodSource,
    /if\s*\(\s*historyEntries\.length\s*===\s*0\s*\)\s*{[\s\S]*?const\s+p2WithArtifactHistory\s*=\s*await\s+mergePlayerHistoryArtifact\(p2\)[\s\S]*?invertDetailedHistoryEntries/,
    "Detailed H2H should load P2 history only when P1 has no entries, then invert reciprocal results"
  );
});
