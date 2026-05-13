const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");

const repoRoot = path.resolve(__dirname, "..", "..");

function readProjectFile(filePath) {
  return fs.readFileSync(path.join(repoRoot, filePath), "utf8");
}

test("schedule page builds public schedule from admin schedule board posts", () => {
  const source = readProjectFile("app/schedule/page.tsx");

  assert.match(source, /listScheduleInfoPosts/);
  assert.doesNotMatch(source, /buildTournamentPredictionMatches/);
  assert.doesNotMatch(source, /loadPredictionState/);
});

test("local public prediction-match seed does not expose placeholder fixture rows", () => {
  const source = readProjectFile("data/metadata/tournament_prediction_matches.v1.json");

  assert.doesNotMatch(source, /TEST|Temporary|placeholder|임시/i);
});
