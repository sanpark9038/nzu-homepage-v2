const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const {
  buildRetiredWithSyncMessage,
  main,
  shouldBlockDirectSupabaseSync,
  shouldRunHomepageIntegrityPreflight,
  stepTimeoutFor,
} = require("./run-ops-pipeline");

const ROOT = path.resolve(__dirname, "..", "..");

function runTest(name, fn) {
  try {
    fn();
    console.log(`PASS ${name}`);
  } catch (error) {
    console.error(`FAIL ${name}`);
    throw error;
  }
}

runTest("ops pipeline step timeouts are bounded by step type", () => {
  assert.equal(stepTimeoutFor("soop_live_snapshot"), 5 * 60 * 1000);
  assert.equal(stepTimeoutFor("homepage_integrity_report"), 10 * 60 * 1000);
  assert.equal(stepTimeoutFor("daily_pipeline"), 60 * 60 * 1000);
  assert.equal(stepTimeoutFor("warehouse_verify"), 5 * 60 * 1000);
  assert.equal(stepTimeoutFor("unknown_step"), 30 * 60 * 1000);
});

runTest("ops pipeline with-sync path is classified as retired direct sync", () => {
  assert.equal(shouldBlockDirectSupabaseSync(["node", "scripts/tools/run-ops-pipeline.js"]), false);
  assert.equal(
    shouldBlockDirectSupabaseSync(["node", "scripts/tools/run-ops-pipeline.js", "--with-supabase-sync"]),
    true
  );

  const message = buildRetiredWithSyncMessage();
  assert.match(message, /pipeline:manual:refresh:with-sync/);
  assert.match(message, /pipeline:push:approved/);
});

runTest("ops pipeline main exits before retired direct sync can run", () => {
  const errors = [];
  let exitCode = null;

  main({
    argv: ["node", "scripts/tools/run-ops-pipeline.js", "--with-supabase-sync", "--dry-run", "--no-discord"],
    writeError(message) {
      errors.push(String(message));
    },
    exitProcess(code) {
      exitCode = code;
    },
  });

  assert.equal(exitCode, 1);
  assert.match(errors.join("\n"), /run-ops-pipeline\.js --with-supabase-sync is retired/);
  assert.match(errors.join("\n"), /pipeline:manual:refresh:with-sync/);
  assert.match(errors.join("\n"), /pipeline:push:approved/);
});

runTest("ops pipeline source does not embed direct Supabase sync steps", () => {
  const source = fs.readFileSync(path.join(ROOT, "scripts", "tools", "run-ops-pipeline.js"), "utf8");

  assert.doesNotMatch(source, /supabase-staging-sync\.js/);
  assert.doesNotMatch(source, /supabase-prod-sync\.js/);
  assert.doesNotMatch(source, /supabase_staging_sync/);
  assert.doesNotMatch(source, /supabase_prod_sync/);
});

runTest("package script does not advertise direct ops-pipeline Supabase sync", () => {
  const packageJson = JSON.parse(fs.readFileSync(path.join(ROOT, "package.json"), "utf8"));
  const script = String(packageJson.scripts["pipeline:ops:with-sync"] || "");

  assert.ok(script, "pipeline:ops:with-sync should remain as a compatibility command");
  assert.doesNotMatch(script, /run-ops-pipeline\.js\s+--with-supabase-sync/);
  assert.match(script, /run-manual-refresh\.js\s+--with-supabase-sync/);
});

runTest("collect-only callers do not pass the retired skip-supabase flag", () => {
  const packageJson = JSON.parse(fs.readFileSync(path.join(ROOT, "package.json"), "utf8"));
  const collectOnlyScript = String(packageJson.scripts["pipeline:collect-only"] || "");
  const chunkedSource = fs.readFileSync(path.join(ROOT, "scripts", "tools", "run-ops-pipeline-chunked.js"), "utf8");

  assert.equal(collectOnlyScript, "node scripts/tools/run-ops-pipeline.js");
  assert.doesNotMatch(chunkedSource, /--skip-supabase/);
});

runTest("only wrapped chunked ops calls opt out of duplicated homepage integrity preflight", () => {
  const packageJson = JSON.parse(fs.readFileSync(path.join(ROOT, "package.json"), "utf8"));
  const collectChunkedScript = String(packageJson.scripts["pipeline:collect:chunked"] || "");
  const chunkedSource = fs.readFileSync(path.join(ROOT, "scripts", "tools", "run-ops-pipeline-chunked.js"), "utf8");
  const manualRefreshSource = fs.readFileSync(path.join(ROOT, "scripts", "tools", "run-manual-refresh.js"), "utf8");
  const windowsCommand = fs.readFileSync(path.join(ROOT, "scripts", "tools", "run-ops-pipeline.cmd"), "utf8");

  assert.doesNotMatch(collectChunkedScript, /--preflight-already-run/);
  assert.doesNotMatch(windowsCommand, /--preflight-already-run/);
  assert.match(manualRefreshSource, /buildCollectChunkedArgs/);
  assert.doesNotMatch(manualRefreshSource, /const collectChunkedArgs = \[[\s\S]*"--preflight-already-run"/);
  assert.match(chunkedSource, /hasFlag\("--preflight-already-run"\)/);
  assert.match(chunkedSource, /--no-homepage-integrity/);
});

runTest("ops pipeline homepage integrity preflight can be disabled for wrapped chunk calls", () => {
  const env = {
    NEXT_PUBLIC_SUPABASE_URL: "https://example.supabase.co",
    SUPABASE_SERVICE_ROLE_KEY: "service-role-key",
  };

  assert.equal(
    shouldRunHomepageIntegrityPreflight(["node", "scripts/tools/run-ops-pipeline.js"], env),
    true
  );
  assert.equal(
    shouldRunHomepageIntegrityPreflight(
      ["node", "scripts/tools/run-ops-pipeline.js", "--no-homepage-integrity"],
      env
    ),
    false
  );
  assert.equal(shouldRunHomepageIntegrityPreflight(["node", "scripts/tools/run-ops-pipeline.js"], {}), false);
});

runTest("manual refresh with-sync delegates only to approved Supabase push", () => {
  const source = fs.readFileSync(path.join(ROOT, "scripts", "tools", "run-manual-refresh.js"), "utf8");

  assert.match(source, /push-supabase-approved\.js/);
  assert.match(source, /\["--approved"\]/);
  assert.doesNotMatch(source, /supabase-staging-sync\.js/);
  assert.doesNotMatch(source, /supabase-prod-sync\.js/);
});

runTest("durable pipeline gates include ops retirement contracts", () => {
  const packageJson = JSON.parse(fs.readFileSync(path.join(ROOT, "package.json"), "utf8"));
  const scripts = packageJson.scripts || {};

  assert.equal(scripts["test:pipeline:manual-refresh"], "node scripts/tools/run-manual-refresh.test.js");
  assert.equal(scripts["test:pipeline:ops"], "node scripts/tools/run-ops-pipeline.test.js");
  assert.match(String(scripts["pipeline:health"] || ""), /npm run test:pipeline:manual-refresh/);
  assert.match(String(scripts["pipeline:health"] || ""), /npm run test:pipeline:ops/);
  assert.match(String(scripts["pipeline:health"] || ""), /npm run test:pipeline:runtime-flow/);
  assert.match(String(scripts["verify:predeploy"] || ""), /npm run test:pipeline:manual-refresh/);
  assert.match(String(scripts["verify:predeploy"] || ""), /npm run test:pipeline:ops/);
  assert.match(String(scripts["verify:predeploy"] || ""), /npm run test:pipeline:runtime-flow/);
});

runTest("scheduled ops workflow runs pipeline health before refresh", () => {
  const workflow = fs.readFileSync(path.join(ROOT, ".github", "workflows", "ops-pipeline-cache.yml"), "utf8");
  const healthIndex = workflow.indexOf("run: npm run pipeline:health");
  const modeIndex = workflow.indexOf("- name: Determine workflow mode");
  const refreshIndex = workflow.indexOf("- name: Run manual refresh");

  assert.notEqual(healthIndex, -1);
  assert.notEqual(modeIndex, -1);
  assert.notEqual(refreshIndex, -1);
  assert.equal(healthIndex < modeIndex, true);
  assert.equal(healthIndex < refreshIndex, true);
  assert.match(workflow, /run_command="npm run pipeline:manual:refresh:with-sync"/);
});
