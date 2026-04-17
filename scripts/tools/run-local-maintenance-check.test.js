const assert = require("node:assert/strict");

const { buildMaintenanceCheck, summarizeManifestPresence } = require("./run-local-maintenance-check");

function runTest(name, fn) {
  try {
    fn();
    console.log(`PASS ${name}`);
  } catch (error) {
    console.error(`FAIL ${name}`);
    throw error;
  }
}

runTest("summarizeManifestPresence reads pipeline output manifest", () => {
  const manifest = summarizeManifestPresence();
  assert.equal(manifest.exists, true);
  assert.equal(typeof manifest.output_count, "number");
  assert.equal(manifest.output_count > 0, true);
});

runTest("buildMaintenanceCheck returns combined maintenance summary", () => {
  const summary = buildMaintenanceCheck({ nowMs: Date.UTC(2026, 3, 17, 0, 0, 0) });
  assert.equal(typeof summary.reports.total_files, "number");
  assert.equal(typeof summary.prune_candidates.root_report_files.count, "number");
  assert.equal(typeof summary.prune_candidates.artifact_directories.count, "number");
  assert.equal(typeof summary.prune_candidates.artifact_zip_files.count, "number");
  assert.deepEqual(summary.next_actions, [
    "npm run reports:footprint",
    "npm run reports:prune",
    "npm run reports:prune:artifact-dirs",
    "npm run reports:prune:artifact-zips",
  ]);
});
