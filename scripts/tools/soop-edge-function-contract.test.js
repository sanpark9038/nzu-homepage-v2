const fs = require("node:fs");
const path = require("node:path");
const assert = require("node:assert/strict");

const ROOT = path.resolve(__dirname, "..", "..");
const EDGE_FUNCTION_PATH = path.join(ROOT, "supabase", "functions", "soop-live-sync", "index.ts");
const SQL_PATH = path.join(ROOT, "scripts", "sql", "create-soop-live-sync-runs.sql");
const WORKFLOW_PATH = path.join(ROOT, ".github", "workflows", "soop-live-sync.yml");
const PACKAGE_PATH = path.join(ROOT, "package.json");

function readProjectFile(filePath) {
  assert.ok(fs.existsSync(filePath), `missing required file: ${path.relative(ROOT, filePath)}`);
  return fs.readFileSync(filePath, "utf8");
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

runTest("SOOP Edge Function exists and owns broad/list parsing", () => {
  const source = readProjectFile(EDGE_FUNCTION_PATH);

  assert.match(source, /https:\/\/openapi\.sooplive\.co\.kr\/broad\/list/);
  assert.match(source, /function\s+collectBroadcastRows/);
  assert.match(source, /function\s+normalizeBroadcastRow/);
  assert.match(source, /DEFAULT_BROAD_LIST_PAGE_LIMIT\s*=\s*200/);
  assert.match(source, /SOOP_BROAD_LIST_PAGE_LIMIT/);
});

runTest("SOOP Edge Function is protected by Supabase headers and sync secret", () => {
  const source = readProjectFile(EDGE_FUNCTION_PATH);

  assert.match(source, /Authorization/i);
  assert.match(source, /apikey/i);
  assert.match(source, /x-sync-secret/i);
  assert.match(source, /SOOP_SYNC_SECRET/);
  assert.match(source, /SUPABASE_ANON_KEY|NEXT_PUBLIC_SUPABASE_ANON_KEY/);
  assert.match(source, /SUPABASE_SERVICE_ROLE_KEY|SUPABASE_SERVICE_KEY/);
});

runTest("SOOP Edge Function updates only changed player live rows and logs each run", () => {
  const source = readProjectFile(EDGE_FUNCTION_PATH);

  assert.match(source, /function\s+buildChangedPlayerPatches/);
  assert.match(source, /last_checked_at/);
  assert.match(source, /broadcast_title/);
  assert.match(source, /live_thumbnail_url/);
  assert.match(source, /is_live/);
  assert.match(source, /from\(["']players["']\)/);
  assert.match(source, /\.update\(/);
  assert.match(source, /soop_live_sync_runs/);
  assert.match(source, /cleanupOldSyncRuns/);
});

runTest("SOOP Edge Function preserves players when page-limit scan is incomplete", () => {
  const source = readProjectFile(EDGE_FUNCTION_PATH);

  assert.match(source, /scanCompleted/);
  assert.match(source, /unresolvedTargetIds/);
  assert.match(source, /unresolvedSoopIds/);
  assert.match(source, /if\s*\(\s*!live\s*&&\s*unresolvedSoopIds\.has\(soopKey\)\s*\)\s*continue/);
  assert.match(source, /unresolved_count:\s*unresolvedTargetIds\.length/);
});

runTest("SOOP Edge Function does not read local generated or preview snapshots", () => {
  const source = readProjectFile(EDGE_FUNCTION_PATH);

  assert.doesNotMatch(source, /soop_live_snapshot\.generated\.v1\.json/);
  assert.doesNotMatch(source, /soop_live_preview\.v1\.json/);
  assert.doesNotMatch(source, /Deno\.readTextFile|readFileSync|fs\./);
});

runTest("SOOP live sync SQL creates run log table and retention cleanup", () => {
  const source = readProjectFile(SQL_PATH);

  assert.match(source, /create\s+table\s+if\s+not\s+exists\s+public\.soop_live_sync_runs/i);
  assert.match(source, /started_at\s+timestamptz/i);
  assert.match(source, /finished_at\s+timestamptz/i);
  assert.match(source, /status\s+text/i);
  assert.match(source, /live_count\s+integer/i);
  assert.match(source, /changed_count\s+integer/i);
  assert.match(source, /delete\s+from\s+public\.soop_live_sync_runs/i);
  assert.match(source, /interval\s+'3 days'|row_number\(\)\s+over/i);
});

runTest("SOOP live sync run log table is not public REST-readable or writable", () => {
  const source = readProjectFile(SQL_PATH);

  assert.match(source, /alter\s+table\s+public\.soop_live_sync_runs\s+enable\s+row\s+level\s+security/i);
  assert.match(source, /revoke\s+all\s+on\s+table\s+public\.soop_live_sync_runs\s+from\s+public/i);
  assert.match(source, /revoke\s+all\s+on\s+table\s+public\.soop_live_sync_runs\s+from\s+anon/i);
  assert.match(source, /revoke\s+all\s+on\s+table\s+public\.soop_live_sync_runs\s+from\s+authenticated/i);
  assert.match(source, /grant\s+all\s+on\s+table\s+public\.soop_live_sync_runs\s+to\s+service_role/i);
});

runTest("SOOP Edge Function fails closed when public cache revalidation is not configured", () => {
  const source = readProjectFile(EDGE_FUNCTION_PATH);

  assert.match(source, /missing_serving_revalidate_env/);
  assert.match(source, /SOOP_SYNC_ALLOW_REVALIDATION_SKIP/);
  assert.match(source, /throw\s+new\s+Error\(\s*`missing_serving_revalidate_env/);
});

runTest("SOOP live sync workflow is manual fallback only", () => {
  const source = readProjectFile(WORKFLOW_PATH);

  assert.match(source, /workflow_dispatch:/);
  assert.doesNotMatch(source, /^\s*schedule:/m);
  assert.doesNotMatch(source, /npm\s+ci/);
  assert.doesNotMatch(source, /soop:snapshot:generate/);
  assert.doesNotMatch(source, /upload-artifact/);
  assert.match(source, /functions\/v1\/soop-live-sync/);
  assert.match(source, /x-sync-secret/);
});

runTest("predeploy verification includes SOOP Edge Function contract", () => {
  const pkg = JSON.parse(readProjectFile(PACKAGE_PATH));

  assert.equal(
    pkg.scripts["test:soop-edge-function-contract"],
    "node scripts/tools/soop-edge-function-contract.test.js"
  );
  assert.match(pkg.scripts["verify:predeploy"], /npm run test:soop-edge-function-contract/);
});
