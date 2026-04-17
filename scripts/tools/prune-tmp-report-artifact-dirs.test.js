const assert = require("node:assert/strict");
const fs = require("fs");
const os = require("os");
const path = require("path");

const {
  buildDecision,
  isEphemeralArtifactDir,
  pruneArtifactDirectories,
} = require("./prune-tmp-report-artifact-dirs");

function runTest(name, fn) {
  try {
    fn();
    console.log(`PASS ${name}`);
  } catch (error) {
    console.error(`FAIL ${name}`);
    throw error;
  }
}

runTest("isEphemeralArtifactDir matches only known cache-like directory patterns", () => {
  assert.equal(isEphemeralArtifactDir("gha_24022462390_artifact"), true);
  assert.equal(isEphemeralArtifactDir("gh-run-23719831943-artifact"), true);
  assert.equal(isEphemeralArtifactDir("run_23895282075_job_logs"), true);
  assert.equal(isEphemeralArtifactDir("team-roster-table"), false);
  assert.equal(isEphemeralArtifactDir("manual_exports"), false);
});

runTest("buildDecision only deletes old artifact directories", () => {
  const nowMs = Date.UTC(2026, 3, 17, 0, 0, 0);
  const oldEntry = {
    name: "gha_1_artifact",
    path: "x",
    sizeBytes: 100,
    lastModifiedMs: nowMs - 10 * 24 * 60 * 60 * 1000,
  };
  const recentEntry = {
    name: "gha_2_artifact",
    path: "x",
    sizeBytes: 100,
    lastModifiedMs: nowMs - 2 * 24 * 60 * 60 * 1000,
  };

  assert.equal(buildDecision(oldEntry, 7, nowMs).keep, false);
  assert.equal(buildDecision(recentEntry, 7, nowMs).keep, true);
});

runTest("pruneArtifactDirectories ignores non-ephemeral directories", () => {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "reports-artifact-prune-"));
  const reportsDir = path.join(tempDir, "reports");
  const oldArtifactDir = path.join(reportsDir, "gha_24011168139_artifact");
  const recentArtifactDir = path.join(reportsDir, "gh-run-24536139979-artifact");
  const ignoredDir = path.join(reportsDir, "team-roster-table");

  fs.mkdirSync(oldArtifactDir, { recursive: true });
  fs.mkdirSync(recentArtifactDir, { recursive: true });
  fs.mkdirSync(ignoredDir, { recursive: true });

  const oldFile = path.join(oldArtifactDir, "artifact.zip");
  const recentFile = path.join(recentArtifactDir, "artifact.zip");
  const ignoredFile = path.join(ignoredDir, "report.json");
  fs.writeFileSync(oldFile, "old");
  fs.writeFileSync(recentFile, "recent");
  fs.writeFileSync(ignoredFile, "keep");

  const oldDate = new Date(Date.UTC(2026, 3, 1, 0, 0, 0));
  const recentDate = new Date(Date.UTC(2026, 3, 16, 0, 0, 0));
  fs.utimesSync(oldFile, oldDate, oldDate);
  fs.utimesSync(oldArtifactDir, oldDate, oldDate);
  fs.utimesSync(recentFile, recentDate, recentDate);
  fs.utimesSync(recentArtifactDir, recentDate, recentDate);

  const summary = pruneArtifactDirectories({
    reportsDir,
    retentionDays: 7,
    nowMs: Date.UTC(2026, 3, 17, 0, 0, 0),
  });

  assert.equal(summary.total_artifact_dirs, 2);
  assert.equal(summary.deleted_artifact_dirs, 1);
  assert.equal(summary.deleted[0].name, "gha_24011168139_artifact");
  assert.equal(fs.existsSync(ignoredDir), true);
});
