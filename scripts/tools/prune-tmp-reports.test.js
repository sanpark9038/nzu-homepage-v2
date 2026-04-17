const assert = require("node:assert/strict");
const fs = require("fs");
const os = require("os");
const path = require("path");

const {
  buildDecision,
  normalizeRetentionDays,
  shouldAlwaysKeep,
} = require("./prune-tmp-reports");

function runTest(name, fn) {
  try {
    fn();
    console.log(`PASS ${name}`);
  } catch (error) {
    console.error(`FAIL ${name}`);
    throw error;
  }
}

runTest("shouldAlwaysKeep keeps latest aliases and pinned reports", () => {
  assert.equal(shouldAlwaysKeep("ops_pipeline_latest.json"), true);
  assert.equal(shouldAlwaysKeep("manual_refresh_latest.md"), true);
  assert.equal(shouldAlwaysKeep("team_roster_sync_report.json"), true);
  assert.equal(shouldAlwaysKeep("daily_pipeline_snapshot_2026-04-01.json"), false);
});

runTest("normalizeRetentionDays falls back for invalid values", () => {
  assert.equal(normalizeRetentionDays("14"), 14);
  assert.equal(normalizeRetentionDays("0"), 14);
  assert.equal(normalizeRetentionDays("-5"), 14);
  assert.equal(normalizeRetentionDays("abc"), 14);
});

runTest("buildDecision deletes only old non-pinned files", () => {
  const nowMs = Date.UTC(2026, 3, 17, 0, 0, 0);
  const oldEntry = {
    name: "daily_pipeline_snapshot_2026-03-01.json",
    path: "x",
    sizeBytes: 100,
    lastModifiedMs: nowMs - 20 * 24 * 60 * 60 * 1000,
  };
  const recentEntry = {
    name: "daily_pipeline_snapshot_2026-04-16.json",
    path: "x",
    sizeBytes: 100,
    lastModifiedMs: nowMs - 1 * 24 * 60 * 60 * 1000,
  };
  const pinnedEntry = {
    name: "daily_pipeline_snapshot_latest.json",
    path: "x",
    sizeBytes: 100,
    lastModifiedMs: nowMs - 40 * 24 * 60 * 60 * 1000,
  };

  assert.equal(buildDecision(oldEntry, 14, nowMs).keep, false);
  assert.equal(buildDecision(recentEntry, 14, nowMs).keep, true);
  assert.equal(buildDecision(pinnedEntry, 14, nowMs).keep, true);
});
