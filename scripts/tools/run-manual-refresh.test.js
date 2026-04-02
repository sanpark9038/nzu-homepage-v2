const assert = require("node:assert/strict");

const { stepTimeoutFor } = require("./run-manual-refresh");

function runTest(name, fn) {
  try {
    fn();
    console.log(`PASS ${name}`);
  } catch (error) {
    console.error(`FAIL ${name}`);
    throw error;
  }
}

runTest("manual refresh step timeouts are bounded by step type", () => {
  assert.equal(stepTimeoutFor("collect_chunked"), 110 * 60 * 1000);
  assert.equal(stepTimeoutFor("supabase_push"), 30 * 60 * 1000);
  assert.equal(stepTimeoutFor("unknown_step"), 30 * 60 * 1000);
});
