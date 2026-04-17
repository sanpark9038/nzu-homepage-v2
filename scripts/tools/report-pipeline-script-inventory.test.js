const assert = require("node:assert/strict");

const { readInventory, summarizeInventory } = require("./report-pipeline-script-inventory");

function runTest(name, fn) {
  try {
    fn();
    console.log(`PASS ${name}`);
  } catch (error) {
    console.error(`FAIL ${name}`);
    throw error;
  }
}

runTest("inventory file has groups", () => {
  const doc = readInventory();
  assert.equal(Array.isArray(doc.groups), true);
  assert.equal(doc.groups.length > 0, true);
});

runTest("inventory summary has no missing or duplicate script entries", () => {
  const summary = summarizeInventory(readInventory());
  assert.equal(summary.total_missing, 0);
  assert.equal(summary.total_duplicates, 0);
  assert.equal(summary.total_scripts > 0, true);
});
