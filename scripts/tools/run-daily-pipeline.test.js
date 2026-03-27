const fs = require("fs");
const os = require("os");
const path = require("path");
const assert = require("node:assert/strict");

const {
  isComparablePriorSnapshot,
  latestPreviousSnapshotPath,
  parseDateTag,
} = require("./lib/daily-pipeline-snapshot");

function makeTempReportsDir() {
  return fs.mkdtempSync(path.join(os.tmpdir(), "nzu-daily-pipeline-"));
}

function runTest(name, fn) {
  try {
    fn();
    console.log(`PASS ${name}`);
  } catch (error) {
    console.error(`FAIL ${name}`);
    throw error;
  }
}

runTest("latestPreviousSnapshotPath excludes the current calendar date", () => {
  const reportsDir = makeTempReportsDir();
  fs.writeFileSync(path.join(reportsDir, "daily_pipeline_snapshot_2026-03-25.json"), "{}");
  fs.writeFileSync(path.join(reportsDir, "daily_pipeline_snapshot_2026-03-26.json"), "{}");
  fs.writeFileSync(path.join(reportsDir, "daily_pipeline_snapshot_2026-03-27.json"), "{}");

  const actual = latestPreviousSnapshotPath("2026-03-27_080957-chunk1", reportsDir);

  assert.equal(actual, path.join(reportsDir, "daily_pipeline_snapshot_2026-03-26.json"));
});

runTest("latestPreviousSnapshotPath returns null when only same-day snapshot exists", () => {
  const reportsDir = makeTempReportsDir();
  fs.writeFileSync(path.join(reportsDir, "daily_pipeline_snapshot_2026-03-27.json"), "{}");

  const actual = latestPreviousSnapshotPath("2026-03-27", reportsDir);

  assert.equal(actual, null);
});

runTest("isComparablePriorSnapshot requires same period_from and earlier prior period_to", () => {
  const prior = {
    period_from: "2025-01-01",
    period_to: "2026-03-26",
  };

  assert.equal(isComparablePriorSnapshot(prior, "2025-01-01", "2026-03-27"), true);
  assert.equal(isComparablePriorSnapshot(prior, "2025-02-01", "2026-03-27"), false);
  assert.equal(isComparablePriorSnapshot(prior, "2025-01-01", "2026-03-26"), false);
  assert.equal(isComparablePriorSnapshot(prior, "2025-01-01", "bad-date"), false);
});

runTest("parseDateTag returns null for non-YYYY-MM-DD text", () => {
  assert.equal(parseDateTag("2026-03-27"), Date.parse("2026-03-27T00:00:00Z"));
  assert.equal(parseDateTag("2026-03-27_080957-chunk1"), null);
  assert.equal(parseDateTag(""), null);
});
