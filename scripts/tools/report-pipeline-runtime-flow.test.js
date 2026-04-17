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
