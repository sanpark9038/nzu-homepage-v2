const assert = require("assert/strict");
const { evaluateReadiness } = require("./check-site-integration-readiness");

function runTest(name, fn) {
  try {
    fn();
    console.log(`PASS ${name}`);
  } catch (error) {
    console.error(`FAIL ${name}`);
    console.error(error instanceof Error ? error.stack : String(error));
    process.exitCode = 1;
  }
}

runTest("evaluateReadiness passes only when all site integration checks pass", () => {
  const actual = evaluateReadiness({
    opsPipelinePass: true,
    opsPipelineStatus: "pass",
    manualRefreshPass: true,
    manualRefreshStatus: "pass",
    supabaseSyncEnabled: true,
    homepageIntegrityFresh: true,
    homepageIntegrityDetail: "fresh (10m)",
    blockingAlerts: 0,
    discordRemovals: 0,
    zeroRecordNeedsReview: 0,
  });

  assert.equal(actual.ready, true);
  assert.deepEqual(actual.failed_checks, []);
});

runTest("evaluateReadiness fails when supabase sync is still disabled", () => {
  const actual = evaluateReadiness({
    opsPipelinePass: true,
    opsPipelineStatus: "pass",
    manualRefreshPass: true,
    manualRefreshStatus: "pass",
    supabaseSyncEnabled: false,
    homepageIntegrityFresh: true,
    homepageIntegrityDetail: "fresh (10m)",
    blockingAlerts: 0,
    discordRemovals: 0,
    zeroRecordNeedsReview: 0,
  });

  assert.equal(actual.ready, false);
  assert.deepEqual(actual.failed_checks, ["supabase_sync_enabled"]);
});

runTest("evaluateReadiness reports multiple blockers together", () => {
  const actual = evaluateReadiness({
    opsPipelinePass: false,
    opsPipelineStatus: "fail",
    manualRefreshPass: true,
    manualRefreshStatus: "pass",
    supabaseSyncEnabled: false,
    homepageIntegrityFresh: false,
    homepageIntegrityDetail: "stale (400m)",
    blockingAlerts: 2,
    discordRemovals: 1,
    zeroRecordNeedsReview: 3,
  });

  assert.equal(actual.ready, false);
  assert.deepEqual(actual.failed_checks, [
    "ops_pipeline_pass",
    "supabase_sync_enabled",
    "homepage_integrity_fresh",
    "blocking_alerts_zero",
    "discord_removals_zero",
    "zero_record_needs_review_zero",
  ]);
});

if (process.exitCode) {
  process.exit(process.exitCode);
}
