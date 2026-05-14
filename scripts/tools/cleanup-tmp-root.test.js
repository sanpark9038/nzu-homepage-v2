const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");

const { listCleanupTargets, shouldRemoveDirectory } = require("./cleanup-tmp-root");

function runTest(name, fn) {
  try {
    fn();
    console.log(`PASS ${name}`);
  } catch (error) {
    console.error(`FAIL ${name}`);
    throw error;
  }
}

runTest("preserves tmp exports because warehouse rebuild reads current exports", () => {
  assert.equal(shouldRemoveDirectory("exports"), false);
});

runTest("does not include exports in tmp root cleanup targets", () => {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "nzu-cleanup-root-"));
  try {
    fs.mkdirSync(path.join(tmpDir, "exports"));
    fs.writeFileSync(path.join(tmpDir, "exports", "eloboard_male_8_sample_matches.csv"), "date,result\n");
    fs.mkdirSync(path.join(tmpDir, "artifacts"));
    fs.writeFileSync(path.join(tmpDir, "artifacts", "old.json"), "{}\n");

    const targets = listCleanupTargets(tmpDir).map((target) => target.name);

    assert.equal(targets.includes("exports"), false);
    assert.equal(targets.includes("artifacts"), true);
  } finally {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
});
