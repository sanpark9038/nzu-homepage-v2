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
    supabaseSyncStatus: "completed",
    cacheRevalidationStatus: "completed",
    cacheRevalidationDetail: "completed",
    homepageIntegrityFresh: true,
    homepageIntegrityDetail: "fresh (10m)",
    liveSnapshotFresh: true,
    liveSnapshotDetail: "fresh (2026-04-20T00:00:00.000Z)",
    staleSnapshotDisagreementCount: 0,
    blockingAlerts: 0,
    discordRemovals: 0,
    zeroRecordNeedsReview: 0,
  });

  assert.equal(actual.ready, true);
  assert.deepEqual(actual.failed_checks, []);
});

runTest("evaluateReadiness fails when supabase sync or cache revalidation is incomplete", () => {
  const actual = evaluateReadiness({
    opsPipelinePass: true,
    opsPipelineStatus: "pass",
    manualRefreshPass: true,
    manualRefreshStatus: "pass",
    supabaseSyncStatus: "skipped",
    cacheRevalidationStatus: "skipped",
    cacheRevalidationDetail: "skipped (missing_base_url_and_secret)",
    homepageIntegrityFresh: true,
    homepageIntegrityDetail: "fresh (10m)",
    liveSnapshotFresh: true,
    liveSnapshotDetail: "fresh (2026-04-20T00:00:00.000Z)",
    staleSnapshotDisagreementCount: 0,
    blockingAlerts: 0,
    discordRemovals: 0,
    zeroRecordNeedsReview: 0,
  });

  assert.equal(actual.ready, false);
  assert.deepEqual(actual.failed_checks, ["supabase_sync_completed", "cache_revalidation_completed"]);
});

runTest("evaluateReadiness reports multiple blockers together", () => {
  const actual = evaluateReadiness({
    opsPipelinePass: false,
    opsPipelineStatus: "fail",
    manualRefreshPass: true,
    manualRefreshStatus: "pass",
    supabaseSyncStatus: "disabled",
    cacheRevalidationStatus: "missing",
    cacheRevalidationDetail: "missing",
    homepageIntegrityFresh: false,
    homepageIntegrityDetail: "stale (400m)",
    liveSnapshotFresh: false,
    liveSnapshotDetail: "stale (2026-04-10T17:53:50.547Z)",
    staleSnapshotDisagreementCount: 79,
    blockingAlerts: 2,
    discordRemovals: 1,
    zeroRecordNeedsReview: 3,
  });

  assert.equal(actual.ready, false);
  assert.deepEqual(actual.failed_checks, [
    "ops_pipeline_pass",
    "supabase_sync_completed",
    "cache_revalidation_completed",
    "homepage_integrity_fresh",
    "live_snapshot_fresh",
    "stale_snapshot_disagreement_zero",
    "blocking_alerts_zero",
    "discord_removals_zero",
    "zero_record_needs_review_zero",
  ]);
});

if (process.exitCode) {
  process.exit(process.exitCode);
}
