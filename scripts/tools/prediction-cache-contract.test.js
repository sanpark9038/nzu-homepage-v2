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

test("prediction public page and API use aggregate vote totals for public reads", () => {
  const pageSource = readProjectFile("app/prediction/page.tsx");
  const apiSource = readProjectFile("app/api/prediction/route.ts");

  assert.match(pageSource, /loadPredictionState\(\{\s*includeVoteTotals: true,\s*\}\)/);
  assert.doesNotMatch(pageSource, /loadPredictionState\(\)\s*;/);

  assert.match(apiSource, /loadPredictionState\(\{\s*voterId,\s*includeVoteTotals: true,\s*\}\)/);
  assert.doesNotMatch(apiSource, /loadPredictionState\(\)\s*;/);
});

test("prediction client refreshes viewer state without overwriting server-rendered matches", () => {
  const clientSource = readProjectFile("components/prediction/TournamentPredictionClient.tsx");

  assert.match(clientSource, /fetch\("\/api\/prediction\?scope=viewer",\s*\{\s*cache:\s*"no-store"\s*\}\)/);
  assert.match(clientSource, /const refreshViewerState = async \(\) => \{/);
  assert.doesNotMatch(clientSource, /void refresh\(\);\s*const interval = window\.setInterval\(refresh, 60000\)/);
});

test("prediction API exposes a lightweight viewer scope before full match hydration", () => {
  const apiSource = readProjectFile("app/api/prediction/route.ts");
  const viewerBranchIndex = apiSource.indexOf('scope === "viewer"');
  const playerListIndex = apiSource.indexOf("playerService.getCachedPlayersList()");

  assert.notEqual(viewerBranchIndex, -1, "viewer scope branch should exist");
  assert.notEqual(playerListIndex, -1, "full public match hydration should still exist");
  assert.ok(
    viewerBranchIndex < playerListIndex,
    "viewer scope should return before loading players and building the full matches payload"
  );
  assert.match(apiSource, /return NextResponse\.json\(\{\s*ok: true,\s*myVotes:/);
});
