const assert = require("node:assert/strict");
const fs = require("fs");
const os = require("os");
const path = require("path");

const { summarizeReportsFootprint } = require("./report-tmp-reports-footprint");

function runTest(name, fn) {
  try {
    fn();
    console.log(`PASS ${name}`);
  } catch (error) {
    console.error(`FAIL ${name}`);
    throw error;
  }
}

runTest("summarizeReportsFootprint reports root and nested files", () => {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "reports-footprint-"));
  const reportsDir = path.join(tempDir, "reports");
  const nestedDir = path.join(reportsDir, "gha_123");

  fs.mkdirSync(reportsDir, { recursive: true });
  fs.mkdirSync(nestedDir, { recursive: true });
  const latestPath = path.join(reportsDir, "daily_pipeline_snapshot_latest.json");
  const oldSnapshotPath = path.join(reportsDir, "daily_pipeline_snapshot_2026-03-01.json");
  const nestedLogPath = path.join(nestedDir, "log.txt");
  fs.writeFileSync(latestPath, "{}");
  fs.writeFileSync(oldSnapshotPath, "{}");
  fs.writeFileSync(nestedLogPath, "nested");

  const oldDate = new Date(Date.UTC(2026, 2, 1, 0, 0, 0));
  const recentDate = new Date(Date.UTC(2026, 3, 16, 0, 0, 0));
  fs.utimesSync(latestPath, recentDate, recentDate);
  fs.utimesSync(oldSnapshotPath, oldDate, oldDate);
  fs.utimesSync(nestedLogPath, recentDate, recentDate);

  const summary = summarizeReportsFootprint({
    reportsDir,
    retentionDays: 14,
    nowMs: Date.UTC(2026, 3, 17, 0, 0, 0),
  });

  assert.equal(summary.total_files, 3);
  assert.equal(summary.root_files, 2);
  assert.equal(summary.nested_files, 1);
  assert.equal(summary.prune_candidates, 1);
  assert.equal(summary.largest_root_buckets[0].name, "gha_123");
});
