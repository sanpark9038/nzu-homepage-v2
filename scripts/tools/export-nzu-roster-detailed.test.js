const fs = require("fs");
const path = require("path");
const assert = require("node:assert/strict");

const ROOT = path.join(__dirname, "..", "..");
const TMP_DIR = path.join(ROOT, "tmp");

const {
  shouldSkipByPriorityWindow,
} = require("./export-nzu-roster-detailed");

function runTest(name, fn) {
  try {
    fn();
    console.log(`PASS ${name}`);
  } catch (error) {
    console.error(`FAIL ${name}`);
    throw error;
  }
}

function writeTempJson(fileName) {
  fs.mkdirSync(TMP_DIR, { recursive: true });
  const filePath = path.join(TMP_DIR, fileName);
  fs.writeFileSync(filePath, "{}", "utf8");
  return filePath;
}

runTest("shouldSkipByPriorityWindow reuses recent cached json within interval", () => {
  const filePath = writeTempJson("__test__priority_window_recent.json");
  try {
    const today = "2026-04-09T00:00:00.000Z";
    const yesterday = new Date("2026-04-08T12:00:00.000Z");
    fs.utimesSync(filePath, yesterday, yesterday);

    assert.equal(
      shouldSkipByPriorityWindow(
        { last_checked_at: "2026-04-08T08:00:00.000Z", check_interval_days: 3 },
        today,
        filePath
      ),
      true
    );
  } finally {
    try {
      fs.unlinkSync(filePath);
    } catch {}
  }
});

runTest("shouldSkipByPriorityWindow forces recollect when cached json is stale", () => {
  const filePath = writeTempJson("__test__priority_window_stale.json");
  try {
    const today = "2026-04-09T00:00:00.000Z";
    const stale = new Date("2026-04-05T12:00:00.000Z");
    fs.utimesSync(filePath, stale, stale);

    assert.equal(
      shouldSkipByPriorityWindow(
        { last_checked_at: "2026-04-08T08:00:00.000Z", check_interval_days: 3 },
        today,
        filePath
      ),
      false
    );
  } finally {
    try {
      fs.unlinkSync(filePath);
    } catch {}
  }
});
