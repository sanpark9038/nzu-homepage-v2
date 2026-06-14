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

test("client H2H fetch requires stable canonical ids and does not run name-candidate fallback loops", () => {
  const source = readProjectFile("lib/matchup-helpers.ts");
  const functionSource = sliceFunction(source, "fetchH2HStats");
  const singleCallIndex = functionSource.indexOf("if (hasStableMatchupIds(player1, player2))");

  assert.match(
    source,
    /function\s+hasStableMatchupIds\(/,
    "Helper should make the ID-based fast path explicit"
  );
  assert.notEqual(singleCallIndex, -1, "fetchH2HStats should require stable canonical ids");
  assert.doesNotMatch(
    functionSource,
    /for\s*\(\s*const\s+leftName\s+of\s+player1Candidates\s*\)/,
    "Client helper should not retry H2H by display-name candidates"
  );
  assert.match(
    functionSource,
    /return\s+fetchSingleH2H\(\s*player1,\s*player2,\s*player1Candidates\[0\]\s*\|\|\s*player1\.name,\s*player2Candidates\[0\]\s*\|\|\s*player2\.name,\s*sharedGender\s*\)/,
    "ID-based fast path should make exactly one API request with the primary display names"
  );
  assert.match(
    functionSource,
    /return\s+null/,
    "Missing canonical ids should fail closed instead of falling back to name-only search"
  );
});

test("client H2H fetch allows the route shared cache policy to work", () => {
  const source = readProjectFile("lib/matchup-helpers.ts");

  assert.doesNotMatch(
    source,
    /fetch\(`\/api\/stats\/h2h\?\$\{params\.toString\(\)\}`,\s*\{\s*cache:\s*["']no-store["']\s*\}\)/,
    "Canonical ID H2H fetches should not force no-store after the API exposes a short shared cache header"
  );
});
