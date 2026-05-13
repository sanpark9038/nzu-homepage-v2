const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");

const repoRoot = path.resolve(__dirname, "..", "..");

function readProjectFile(filePath) {
  return fs.readFileSync(path.join(repoRoot, filePath), "utf8");
}

test("schedule page builds public matches from explicit prediction state", () => {
  const source = readProjectFile("app/schedule/page.tsx");

  assert.match(source, /loadPredictionState/);
  assert.match(source, /await\s+loadPredictionState\(\)/);
  assert.match(source, /buildTournamentPredictionMatches\(\s*players\s*,\s*\w+\s*\)/);
  assert.doesNotMatch(source, /buildTournamentPredictionMatches\(\s*players\s*\)/);
});

test("local public prediction-match seed does not expose placeholder fixture rows", () => {
  const source = readProjectFile("data/metadata/tournament_prediction_matches.v1.json");

  assert.doesNotMatch(source, /TEST|Temporary|placeholder|임시/i);
});
