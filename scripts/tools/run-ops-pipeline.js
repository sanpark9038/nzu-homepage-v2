const fs = require("fs");
const path = require("path");
const { spawnSync } = require("child_process");

const ROOT = path.resolve(__dirname, "..", "..");
const REPORT_DIR = path.join(ROOT, "tmp", "reports");

function hasFlag(flag) {
  return process.argv.includes(flag);
}

function timestamp() {
  const d = new Date();
  const p = (n) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}_${p(d.getHours())}${p(d.getMinutes())}${p(d.getSeconds())}`;
}

function runStep(name, args, options = {}) {
  const startedAt = new Date().toISOString();
  const res = spawnSync("node", args, {
    cwd: ROOT,
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
    maxBuffer: 64 * 1024 * 1024,
  });
  const endedAt = new Date().toISOString();
  const ok = res.status === 0;
  const step = {
    name,
    command: `node ${args.join(" ")}`,
    started_at: startedAt,
    ended_at: endedAt,
    exit_code: res.status,
    ok,
    stdout: String(res.stdout || "").trim(),
    stderr: String(res.stderr || "").trim(),
  };
  if (!ok && !options.allowFailure) throw Object.assign(new Error(`Step failed: ${name}`), { step });
  return step;
}

function ensureFile(relPath) {
  const abs = path.join(ROOT, relPath);
  if (!fs.existsSync(abs)) throw new Error(`Missing required script: ${relPath}`);
  return abs;
}

function main() {
  const skipSupabase = hasFlag("--skip-supabase");
  const dateTag = timestamp();

  const steps = [];
  let status = "pass";
  let errorMessage = "";

  try {
    ensureFile("scripts/tools/run-daily-pipeline.js");
    ensureFile("scripts/tools/verify-warehouse-integrity.js");
    if (!skipSupabase) {
      ensureFile("scripts/tools/supabase-staging-sync.js");
      ensureFile("scripts/tools/supabase-prod-sync.js");
    }

    steps.push(
      runStep("daily_pipeline", ["scripts/tools/run-daily-pipeline.js"])
    );
    steps.push(
      runStep("warehouse_verify", ["scripts/tools/verify-warehouse-integrity.js"])
    );
    if (!skipSupabase) {
      steps.push(
        runStep("supabase_staging_sync", ["scripts/tools/supabase-staging-sync.js"])
      );
      steps.push(
        runStep("supabase_prod_sync", ["scripts/tools/supabase-prod-sync.js"])
      );
    }
  } catch (err) {
    status = "fail";
    if (err && err.step) steps.push(err.step);
    errorMessage = err instanceof Error ? err.message : String(err);
  }

  const report = {
    generated_at: new Date().toISOString(),
    status,
    error: errorMessage || null,
    skip_supabase: skipSupabase,
    steps: steps.map((s) => ({
      name: s.name,
      command: s.command,
      started_at: s.started_at,
      ended_at: s.ended_at,
      exit_code: s.exit_code,
      ok: s.ok,
    })),
  };

  fs.mkdirSync(REPORT_DIR, { recursive: true });
  const reportPath = path.join(REPORT_DIR, `ops_pipeline_report_${dateTag}.json`);
  fs.writeFileSync(reportPath, JSON.stringify(report, null, 2), "utf8");

  console.log(JSON.stringify({
    ...report,
    report_path: path.relative(ROOT, reportPath).replace(/\\/g, "/"),
  }, null, 2));

  if (status !== "pass") process.exit(1);
}

main();

