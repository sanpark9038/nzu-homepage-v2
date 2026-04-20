const fs = require("fs");
const path = require("path");
const assert = require("node:assert/strict");

const ROOT = path.join(__dirname, "..", "..");
const TMP_DIR = path.join(ROOT, "tmp");

const { safeFileName, buildOutputPaths, writeCsvWithFallback } = require("./export-player-matches-csv");

function runTest(name, fn) {
  try {
    fn();
    console.log(`PASS ${name}`);
  } catch (error) {
    console.error(`FAIL ${name}`);
    throw error;
  }
}

runTest("safeFileName falls back for placeholder-only player names", () => {
  assert.equal(safeFileName("??"), "unknown_player");
  assert.equal(safeFileName(""), "unknown_player");
});

runTest("buildOutputPaths sanitizes default report and csv filenames", () => {
  const { reportPath, csvPath } = buildOutputPaths({
    univ: "ku",
    player: "??",
    from: "2025-01-01",
    to: "2026-04-20",
    stableName: true,
    explicitReportPath: null,
    explicitCsvPath: null,
  });
  assert.match(reportPath, /ku_unknown_player_matches\.json$/);
  assert.match(csvPath, /unknown_player_matches\.csv$/);
});

runTest("writeCsvWithFallback can write sanitized unknown-player csv path", () => {
  fs.mkdirSync(TMP_DIR, { recursive: true });
  const filePath = path.join(TMP_DIR, "unknown_player_matches.csv");
  try {
    const finalPath = writeCsvWithFallback(filePath, "\uFEFFdate,opponent\n");
    assert.equal(finalPath, filePath);
    assert.equal(fs.existsSync(filePath), true);
  } finally {
    try {
      fs.unlinkSync(filePath);
    } catch {}
  }
});
