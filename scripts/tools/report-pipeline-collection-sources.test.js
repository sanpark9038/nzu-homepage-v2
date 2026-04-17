const assert = require("node:assert/strict");

const { readSourcesDoc, summarizeSources } = require("./report-pipeline-collection-sources");

function runTest(name, fn) {
  try {
    fn();
    console.log(`PASS ${name}`);
  } catch (error) {
    console.error(`FAIL ${name}`);
    throw error;
  }
}

runTest("collection sources doc has sources", () => {
  const doc = readSourcesDoc();
  assert.equal(Array.isArray(doc.sources), true);
  assert.equal(doc.sources.length > 0, true);
});

runTest("collection sources summary exposes roles and source count", () => {
  const summary = summarizeSources(readSourcesDoc());
  assert.equal(summary.total_sources > 0, true);
  assert.equal(Array.isArray(summary.roles), true);
  assert.equal(summary.roles.length > 0, true);
});
