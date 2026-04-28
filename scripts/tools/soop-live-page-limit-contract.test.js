const fs = require("fs");
const path = require("path");
const assert = require("assert");
const { DEFAULT_BROAD_LIST_PAGE_LIMIT } = require("./lib/soop-open-api");

const ROOT = path.resolve(__dirname, "..", "..");
const MIN_SNAPSHOT_PAGE_LIMIT = 200;

function readProjectFile(relativePath) {
  return fs.readFileSync(path.join(ROOT, relativePath), "utf8");
}

function runTest(name, fn) {
  try {
    fn();
    console.log(`PASS ${name}`);
  } catch (error) {
    console.error(`FAIL ${name}`);
    console.error(error && error.stack ? error.stack : error);
    process.exitCode = 1;
  }
}

runTest("generated SOOP live snapshot scans deeply enough for late-page live rows", () => {
  const relativePath = "scripts/tools/generate-soop-live-snapshot.js";
  const source = readProjectFile(relativePath);

  assert.ok(
    DEFAULT_BROAD_LIST_PAGE_LIMIT >= MIN_SNAPSHOT_PAGE_LIMIT,
    `expected DEFAULT_BROAD_LIST_PAGE_LIMIT >= ${MIN_SNAPSHOT_PAGE_LIMIT}, got ${DEFAULT_BROAD_LIST_PAGE_LIMIT}`
  );
  assert.ok(
    source.includes("DEFAULT_PAGE_LIMIT = DEFAULT_BROAD_LIST_PAGE_LIMIT"),
    `${relativePath} must use the shared SOOP broad/list page limit`
  );
});
