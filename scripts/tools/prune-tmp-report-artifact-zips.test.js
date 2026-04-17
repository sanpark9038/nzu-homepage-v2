const assert = require("node:assert/strict");
const fs = require("fs");
const os = require("os");
const path = require("path");

const {
  buildDecision,
  isEphemeralArtifactZip,
  pruneArtifactZipFiles,
} = require("./prune-tmp-report-artifact-zips");

function runTest(name, fn) {
  try {
    fn();
    console.log(`PASS ${name}`);
  } catch (error) {
    console.error(`FAIL ${name}`);
    throw error;
  }
}

runTest("isEphemeralArtifactZip matches only cache-like root zip artifacts", () => {
  assert.equal(isEphemeralArtifactZip("gha_24011168139_artifact.zip"), true);
  assert.equal(isEphemeralArtifactZip("gha_24011168139_logs.zip"), true);
  assert.equal(isEphemeralArtifactZip("gh-run-23719831943-artifact.zip"), true);
  assert.equal(isEphemeralArtifactZip("team-roster-table.zip"), false);
  assert.equal(isEphemeralArtifactZip("manual_export.zip"), false);
});

runTest("buildDecision only deletes old artifact zips", () => {
  const nowMs = Date.UTC(2026, 3, 17, 0, 0, 0);
  const oldEntry = {
    name: "gha_1_artifact.zip",
    path: "x",
    sizeBytes: 100,
    lastModifiedMs: nowMs - 10 * 24 * 60 * 60 * 1000,
  };
  const recentEntry = {
    name: "gha_2_logs.zip",
    path: "x",
    sizeBytes: 100,
    lastModifiedMs: nowMs - 2 * 24 * 60 * 60 * 1000,
  };

  assert.equal(buildDecision(oldEntry, 7, nowMs).keep, false);
  assert.equal(buildDecision(recentEntry, 7, nowMs).keep, true);
});

runTest("pruneArtifactZipFiles ignores non-ephemeral zip files", () => {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "reports-artifact-zips-"));
  const reportsDir = path.join(tempDir, "reports");
  fs.mkdirSync(reportsDir, { recursive: true });

  const oldArtifactZip = path.join(reportsDir, "gha_24011168139_artifact.zip");
  const recentLogsZip = path.join(reportsDir, "gha_24020370853_logs.zip");
  const ignoredZip = path.join(reportsDir, "team-roster-table.zip");
  fs.writeFileSync(oldArtifactZip, "old");
  fs.writeFileSync(recentLogsZip, "recent");
  fs.writeFileSync(ignoredZip, "keep");

  const oldDate = new Date(Date.UTC(2026, 3, 1, 0, 0, 0));
  const recentDate = new Date(Date.UTC(2026, 3, 16, 0, 0, 0));
  fs.utimesSync(oldArtifactZip, oldDate, oldDate);
  fs.utimesSync(recentLogsZip, recentDate, recentDate);
  fs.utimesSync(ignoredZip, oldDate, oldDate);

  const summary = pruneArtifactZipFiles({
    reportsDir,
    retentionDays: 7,
    nowMs: Date.UTC(2026, 3, 17, 0, 0, 0),
  });

  assert.equal(summary.total_artifact_zips, 2);
  assert.equal(summary.deleted_artifact_zips, 1);
  assert.equal(summary.deleted[0].name, "gha_24011168139_artifact.zip");
  assert.equal(fs.existsSync(ignoredZip), true);
});
