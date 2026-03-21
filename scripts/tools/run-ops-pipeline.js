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

function tailLines(text, count = 20) {
  const lines = String(text || "")
    .split(/\r?\n/)
    .map((v) => v.trimEnd())
    .filter((v) => v.length > 0);
  return lines.slice(Math.max(0, lines.length - count));
}

function writeText(filePath, content) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, content, "utf8");
}

function buildMarkdownSummary(report, reportPath) {
  const lines = [];
  lines.push(`# Ops Pipeline Report`);
  lines.push("");
  lines.push(`- Generated: ${report.generated_at}`);
  lines.push(`- Status: **${report.status.toUpperCase()}**`);
  lines.push(`- Skip Supabase: ${report.skip_supabase ? "yes" : "no"}`);
  if (report.error) lines.push(`- Error: ${report.error}`);
  lines.push(`- JSON Report: ${reportPath}`);
  lines.push("");
  lines.push(`## Steps`);
  for (const step of report.steps) {
    lines.push(`- ${step.name}: ${step.ok ? "ok" : "fail"} (exit=${step.exit_code})`);
  }
  if (report.failure_step) {
    lines.push("");
    lines.push(`## Failure Detail`);
    lines.push(`- Failed Step: ${report.failure_step.name}`);
    lines.push(`- Command: \`${report.failure_step.command}\``);
    if (report.failure_step.stderr_tail && report.failure_step.stderr_tail.length) {
      lines.push(`- stderr tail:`);
      for (const row of report.failure_step.stderr_tail) lines.push(`  - ${row}`);
    } else if (report.failure_step.stdout_tail && report.failure_step.stdout_tail.length) {
      lines.push(`- stdout tail:`);
      for (const row of report.failure_step.stdout_tail) lines.push(`  - ${row}`);
    }
  }
  return lines.join("\n");
}

function ensureFile(relPath) {
  const abs = path.join(ROOT, relPath);
  if (!fs.existsSync(abs)) throw new Error(`Missing required script: ${relPath}`);
  return abs;
}

function main() {
  const skipSupabase = hasFlag("--skip-supabase");
  const dryRun = hasFlag("--dry-run");
  const dateTag = timestamp();

  const steps = [];
  let status = "pass";
  let errorMessage = "";
  let failureStep = null;

  try {
    ensureFile("scripts/tools/run-daily-pipeline.js");
    ensureFile("scripts/tools/verify-warehouse-integrity.js");
    if (!skipSupabase) {
      ensureFile("scripts/tools/supabase-staging-sync.js");
      ensureFile("scripts/tools/supabase-prod-sync.js");
    }

    if (dryRun) {
      steps.push({
        name: "daily_pipeline",
        command: "node scripts/tools/run-daily-pipeline.js",
        started_at: new Date().toISOString(),
        ended_at: new Date().toISOString(),
        exit_code: 0,
        ok: true,
        stdout: "[dry-run]",
        stderr: "",
      });
      steps.push({
        name: "warehouse_verify",
        command: "node scripts/tools/verify-warehouse-integrity.js",
        started_at: new Date().toISOString(),
        ended_at: new Date().toISOString(),
        exit_code: 0,
        ok: true,
        stdout: "[dry-run]",
        stderr: "",
      });
      if (!skipSupabase) {
        steps.push({
          name: "supabase_staging_sync",
          command: "node scripts/tools/supabase-staging-sync.js",
          started_at: new Date().toISOString(),
          ended_at: new Date().toISOString(),
          exit_code: 0,
          ok: true,
          stdout: "[dry-run]",
          stderr: "",
        });
        steps.push({
          name: "supabase_prod_sync",
          command: "node scripts/tools/supabase-prod-sync.js",
          started_at: new Date().toISOString(),
          ended_at: new Date().toISOString(),
          exit_code: 0,
          ok: true,
          stdout: "[dry-run]",
          stderr: "",
        });
      }
    } else {
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
    }
  } catch (err) {
    status = "fail";
    if (err && err.step) steps.push(err.step);
    if (err && err.step) failureStep = err.step;
    errorMessage = err instanceof Error ? err.message : String(err);
  }

  const report = {
    generated_at: new Date().toISOString(),
    status,
    error: errorMessage || null,
    dry_run: dryRun,
    skip_supabase: skipSupabase,
    steps: steps.map((s) => ({
      name: s.name,
      command: s.command,
      started_at: s.started_at,
      ended_at: s.ended_at,
      exit_code: s.exit_code,
      ok: s.ok,
    })),
    failure_step: failureStep
      ? {
          name: failureStep.name,
          command: failureStep.command,
          exit_code: failureStep.exit_code,
          stdout_tail: tailLines(failureStep.stdout, 15),
          stderr_tail: tailLines(failureStep.stderr, 15),
        }
      : null,
  };

  fs.mkdirSync(REPORT_DIR, { recursive: true });
  const reportPath = path.join(REPORT_DIR, `ops_pipeline_report_${dateTag}.json`);
  const latestJsonPath = path.join(REPORT_DIR, "ops_pipeline_latest.json");
  const mdPath = path.join(REPORT_DIR, `ops_pipeline_report_${dateTag}.md`);
  const latestMdPath = path.join(REPORT_DIR, "ops_pipeline_latest.md");
  fs.writeFileSync(reportPath, JSON.stringify(report, null, 2), "utf8");
  fs.writeFileSync(latestJsonPath, JSON.stringify(report, null, 2), "utf8");
  writeText(mdPath, buildMarkdownSummary(report, path.relative(ROOT, reportPath).replace(/\\/g, "/")));
  writeText(latestMdPath, buildMarkdownSummary(report, path.relative(ROOT, reportPath).replace(/\\/g, "/")));

  console.log(JSON.stringify({
    ...report,
    report_path: path.relative(ROOT, reportPath).replace(/\\/g, "/"),
    report_md_path: path.relative(ROOT, mdPath).replace(/\\/g, "/"),
    latest_json_path: path.relative(ROOT, latestJsonPath).replace(/\\/g, "/"),
    latest_md_path: path.relative(ROOT, latestMdPath).replace(/\\/g, "/"),
  }, null, 2));

  if (status !== "pass") process.exit(1);
}

main();
