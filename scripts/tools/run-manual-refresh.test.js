const fs = require("node:fs");
const assert = require("node:assert/strict");
const path = require("node:path");
const Module = require("node:module");

const {
  evaluateSupabaseSyncGate,
  parseCacheRevalidationResult,
  stepTimeoutFor,
  summarizeBlockingAlerts,
} = require("./run-manual-refresh");

function loadManualRefreshDiscordHelpers() {
  const filePath = path.join(__dirname, "send-manual-refresh-discord.js");
  const source = fs
    .readFileSync(filePath, "utf8")
    .replace(
      "  writeCurrentRosterStateSnapshot(REPORTS_DIR, afterPlayers);\n",
      "  // skipped in tests\n"
    )
    + "\nmodule.exports.__test__ = { supabaseSyncModeLabel, workflowSyncWarning };\n";

  const testModule = new Module(filePath, module);
  testModule.filename = filePath;
  testModule.paths = Module._nodeModulePaths(path.dirname(filePath));
  testModule._compile(source, filePath);
  return testModule.exports.__test__;
}

const manualRefreshDiscordHelpers = loadManualRefreshDiscordHelpers();

function withTemporaryEnv(overrides, fn) {
  const previous = new Map();
  for (const [key, value] of Object.entries(overrides)) {
    previous.set(key, Object.prototype.hasOwnProperty.call(process.env, key) ? process.env[key] : undefined);
    if (value === undefined) {
      delete process.env[key];
    } else {
      process.env[key] = value;
    }
  }

  try {
    return fn();
  } finally {
    for (const [key, value] of previous.entries()) {
      if (value === undefined) {
        delete process.env[key];
      } else {
        process.env[key] = value;
      }
    }
  }
}

function withTemporaryManualRefreshReport(reportDoc, fn) {
  const reportPath = path.join(__dirname, "..", "..", "tmp", "reports", "manual_refresh_latest.json");
  const hadOriginal = fs.existsSync(reportPath);
  const original = hadOriginal ? fs.readFileSync(reportPath, "utf8") : null;

  fs.mkdirSync(path.dirname(reportPath), { recursive: true });
  fs.writeFileSync(reportPath, JSON.stringify(reportDoc, null, 2), "utf8");

  try {
    return fn();
  } finally {
    try {
      if (hadOriginal) {
        fs.writeFileSync(reportPath, original, "utf8");
      } else if (fs.existsSync(reportPath)) {
        fs.unlinkSync(reportPath);
      }
    } catch {}
  }
}

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
  assert.equal(stepTimeoutFor("soop_live_snapshot"), 5 * 60 * 1000);
  assert.equal(stepTimeoutFor("homepage_integrity_report"), 10 * 60 * 1000);
  assert.equal(stepTimeoutFor("collect_chunked"), 110 * 60 * 1000);
  assert.equal(stepTimeoutFor("supabase_push"), 30 * 60 * 1000);
  assert.equal(stepTimeoutFor("unknown_step"), 30 * 60 * 1000);
});

runTest("summarizeBlockingAlerts returns only blocking severities", () => {
  const actual = summarizeBlockingAlerts({
    blocking_severities: ["critical", "high"],
    alerts: [
      { severity: "medium", team: "ops", rule: "stale", message: "ignore for gate" },
      { severity: "critical", team: "ops", rule: "fetch_fail", message: "stop publish" },
      { severity: "high", team: "bgm", rule: "zero_record", message: "stop publish too" },
    ],
  });

  assert.equal(actual.total, 2);
  assert.deepEqual(
    actual.preview.map((row) => row.rule),
    ["fetch_fail", "zero_record"]
  );
});

runTest("evaluateSupabaseSyncGate blocks publish when blocking alerts exist", () => {
  const actual = evaluateSupabaseSyncGate({
    blocking_severities: ["critical", "high"],
    alerts: [
      { severity: "medium", team: "ops", rule: "stale_live_snapshot_disagreement", message: "warn only" },
      { severity: "critical", team: "ops", rule: "pipeline_failure", message: "do not publish" },
    ],
  });

  assert.equal(actual.allowed, false);
  assert.equal(actual.reason, "blocking_alerts_present");
  assert.equal(actual.blocking_alerts_total, 1);
});

runTest("evaluateSupabaseSyncGate allows publish when only non-blocking alerts exist", () => {
  const actual = evaluateSupabaseSyncGate({
    blocking_severities: ["critical", "high"],
    alerts: [
      { severity: "medium", team: "ops", rule: "stale_live_snapshot_disagreement", message: "warn only" },
    ],
  });

  assert.equal(actual.allowed, true);
  assert.equal(actual.reason, null);
  assert.equal(actual.blocking_alerts_total, 0);
});

runTest("parseCacheRevalidationResult reads structured marker lines from supabase push output", () => {
  const actual = parseCacheRevalidationResult({
    stdout_tail: [
      "[OK] revalidate_public_cache",
      'CACHE_REVALIDATION_RESULT {"status":"skipped","reason":"missing_base_url_and_secret"}',
    ],
    stderr_tail: [],
  });

  assert.deepEqual(actual, {
    status: "skipped",
    reason: "missing_base_url_and_secret",
  });
});

runTest("manual refresh reporting surfaces cache revalidation statuses after supabase sync", () => {
  withTemporaryEnv({ WORKFLOW_MODE_LABEL: "", WORKFLOW_SYNC_WARNING: "" }, () => {
    withTemporaryManualRefreshReport(
      {
        generated_at: "2026-04-20T00:00:00.000Z",
        status: "pass",
        error: null,
        with_supabase_sync: true,
        supabase_sync: {
          requested: true,
          attempted: true,
          status: "completed",
          skip_reason: null,
          warning: null,
          blocking_alerts_total: 0,
          blocking_alerts_preview: [],
          cache_revalidation: {
            status: "failed",
            reason: "revalidate_public_cache failed (500 Internal Server Error)",
          },
        },
        steps: [],
        failure_step: null,
        baseline_path: "tmp/reports/manual_refresh_baseline.json",
      },
      () => {
        assert.equal(
          manualRefreshDiscordHelpers.supabaseSyncModeLabel().includes("cache revalidation: failed"),
          true
        );
        assert.equal(
          manualRefreshDiscordHelpers.workflowSyncWarning(),
          "Cache revalidation failed: revalidate_public_cache failed (500 Internal Server Error)"
        );
      }
    );
  });
});

runTest("manual refresh reporting keeps blocking-alert skip reasons visible after supabase sync", () => {
  withTemporaryEnv({ WORKFLOW_MODE_LABEL: "", WORKFLOW_SYNC_WARNING: "" }, () => {
    withTemporaryManualRefreshReport(
      {
        generated_at: "2026-04-20T00:00:00.000Z",
        status: "pass",
        error: null,
        with_supabase_sync: true,
        supabase_sync: {
          requested: true,
          attempted: false,
          status: "skipped",
          skip_reason: "blocking_alerts_present",
          warning: null,
          blocking_alerts_total: 2,
          blocking_alerts_preview: [
            { severity: "critical", team: "ops", rule: "stale_report", message: "stop publish" },
            { severity: "high", team: "ops", rule: "cache", message: "stop publish too" },
          ],
        },
        steps: [],
        failure_step: null,
        baseline_path: "tmp/reports/manual_refresh_baseline.json",
      },
      () => {
        assert.equal(manualRefreshDiscordHelpers.supabaseSyncModeLabel().includes("Supabase sync skipped"), true);
        assert.equal(
          manualRefreshDiscordHelpers.workflowSyncWarning(),
          "Supabase sync skipped because blocking alerts are present (2)."
        );
      }
    );
  });
});
