const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");

const repoRoot = path.resolve(__dirname, "..", "..");

function readProjectFile(filePath) {
  return fs.readFileSync(path.join(repoRoot, filePath), "utf8");
}

test("fresh player match reports include a generated timestamp in the JSON payload", () => {
  const source = readProjectFile("scripts/tools/report-team-records.js");

  assert.match(source, /const generatedAt = new Date\(\)\.toISOString\(\);/);
  assert.match(source, /generated_at:\s*generatedAt/);
});

test("collection priority metadata does not use restored cache file mtime as last_checked_at", () => {
  const source = readProjectFile("scripts/tools/update-player-check-priority.js");

  assert.doesNotMatch(source, /stat\.mtime\.toISOString\(\)/);
  assert.match(source, /isoOrNull\(doc\.generated_at\)/);
  assert.match(source, /readPlayerMatchMeta\(.*existingPlayer/);
});

test("inactive existing-json reuse cannot override players that are due by priority window", () => {
  const source = readProjectFile("scripts/tools/export-team-roster-detailed.js");

  assert.match(source, /const hasPriorityWindow = /);
  assert.match(source, /else if \(!hasPriorityWindow && inactiveSkipDays > 0\)/);
  assert.doesNotMatch(source, /else if \(inactiveSkipDays > 0\) \{/);
});
