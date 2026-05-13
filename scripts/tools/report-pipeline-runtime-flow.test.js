const assert = require("node:assert/strict");

const { readFlowDoc, summarizeRuntimeFlow } = require("./report-pipeline-runtime-flow");

function runTest(name, fn) {
  try {
    fn();
    console.log(`PASS ${name}`);
  } catch (error) {
    console.error(`FAIL ${name}`);
    throw error;
  }
}

runTest("runtime flow document has flow entries", () => {
  const doc = readFlowDoc();
  assert.equal(Array.isArray(doc.flows), true);
  assert.equal(doc.flows.length > 0, true);
});

runTest("runtime flow summary reports nonzero flows and outputs", () => {
  const summary = summarizeRuntimeFlow(readFlowDoc());
  assert.equal(summary.total_flows > 0, true);
  assert.equal(summary.total_unique_outputs > 0, true);
});

runTest("single chunk runtime flow is collect-only and approved sync owns serving writes", () => {
  const doc = readFlowDoc();
  const flows = new Map(doc.flows.map((flow) => [flow.id, flow]));
  const githubActionsSteps = flows.get("github_actions_collect_only").steps.join("\n");
  const manualRefreshSteps = flows.get("manual_refresh_local").steps.join("\n");
  const chunkedSteps = flows.get("chunked_pipeline_orchestration").steps.join("\n");
  const singleChunkFlow = flows.get("single_chunk_pipeline");
  const singleChunkSteps = singleChunkFlow.steps.join("\n");
  const approvedSyncSteps = flows.get("approved_serving_sync").steps.join("\n");

  assert.match(githubActionsSteps, /npm run pipeline:health/);
  assert.match(manualRefreshSteps, /generate-soop-live-snapshot\.js/);
  assert.match(manualRefreshSteps, /report-homepage-integrity\.js/);
  assert.match(
    manualRefreshSteps,
    /run-ops-pipeline-chunked\.js --preflight-already-run only when top-level homepage integrity passes/
  );
  assert.doesNotMatch(chunkedSteps, /--skip-supabase/);
  assert.match(chunkedSteps, /--no-homepage-integrity only when --preflight-already-run is present/);
  assert.doesNotMatch(singleChunkSteps, /supabase-staging-sync\.js/);
  assert.doesNotMatch(singleChunkSteps, /supabase-prod-sync\.js/);
  assert.doesNotMatch(singleChunkSteps, /--skip-supabase/);
  assert.match(singleChunkFlow.steps[0], /before collection or sync work/);
  assert.match(singleChunkSteps, /fail-closed/);
  assert.match(approvedSyncSteps, /supabase-staging-sync\.js/);
  assert.match(approvedSyncSteps, /supabase-prod-sync\.js/);
});
