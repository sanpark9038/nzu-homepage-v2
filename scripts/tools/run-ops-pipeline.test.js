const assert = require("node:assert/strict");

const { stepTimeoutFor } = require("./run-ops-pipeline");

function runTest(name, fn) {
  try {
    fn();
    console.log(`PASS ${name}`);
  } catch (error) {
    console.error(`FAIL ${name}`);
    throw error;
  }
}

runTest("ops pipeline step timeouts are bounded by step type", () => {
  assert.equal(stepTimeoutFor("daily_pipeline"), 60 * 60 * 1000);
  assert.equal(stepTimeoutFor("warehouse_verify"), 5 * 60 * 1000);
  assert.equal(stepTimeoutFor("supabase_staging_sync"), 30 * 60 * 1000);
  assert.equal(stepTimeoutFor("supabase_prod_sync"), 30 * 60 * 1000);
  assert.equal(stepTimeoutFor("unknown_step"), 30 * 60 * 1000);
});
