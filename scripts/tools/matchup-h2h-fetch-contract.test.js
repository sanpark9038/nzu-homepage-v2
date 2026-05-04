const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");

const repoRoot = path.resolve(__dirname, "..", "..");

function readProjectFile(filePath) {
  return fs.readFileSync(path.join(repoRoot, filePath), "utf8");
}

function sliceFunction(source, functionName) {
  const start = source.indexOf(`export async function ${functionName}`);
  assert.notEqual(start, -1, `${functionName} should exist`);
  const rest = source.slice(start);
  const nextExport = rest.slice(1).search(/\nexport\s+/);
  return nextExport === -1 ? rest : rest.slice(0, nextExport + 1);
}

test("ID-based client H2H fetch performs one API call before name-candidate fallback loops", () => {
  const source = readProjectFile("lib/matchup-helpers.ts");
  const functionSource = sliceFunction(source, "fetchH2HStats");
  const singleCallIndex = functionSource.indexOf("if (hasStableMatchupIds(player1, player2))");
  const firstLoopIndex = functionSource.indexOf("for (const leftName of player1Candidates)");

  assert.match(
    source,
    /function\s+hasStableMatchupIds\(/,
    "Helper should make the ID-based fast path explicit"
  );
  assert.notEqual(singleCallIndex, -1, "fetchH2HStats should have an ID-based fast path");
  assert.notEqual(firstLoopIndex, -1, "fetchH2HStats should keep name-candidate fallback loops");
  assert.ok(
    singleCallIndex < firstLoopIndex,
    "ID-based fast path should run before candidate fallback loops"
  );
  assert.match(
    functionSource,
    /return\s+fetchSingleH2H\(\s*player1,\s*player2,\s*player1Candidates\[0\]\s*\|\|\s*player1\.name,\s*player2Candidates\[0\]\s*\|\|\s*player2\.name,\s*sharedGender\s*\)/,
    "ID-based fast path should make exactly one API request with the primary display names"
  );
});
