const fs = require("fs");
const path = require("path");
const { spawnSync } = require("child_process");
require("dotenv").config({ path: path.join(__dirname, "..", "..", ".env.local") });

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

async function postDiscordWebhook(content) {
  const webhook =
    process.env.OPS_DISCORD_WEBHOOK_URL ||
    process.env.DISCORD_WEBHOOK_URL ||
    "";
  if (!String(webhook).trim()) return { sent: false, reason: "missing_webhook" };

  const res = await fetch(webhook, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ content }),
  });
  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new Error(`Discord webhook failed: ${res.status} ${body}`);
  }
  return { sent: true };
}

function buildDiscordMessage(report, paths) {
  const icon = report.status === "pass" ? "✅" : "❌";
  const base = [
    `${icon} NZU Ops Pipeline ${report.status.toUpperCase()}`,
    `- generated: ${report.generated_at}`,
    `- dry_run: ${report.dry_run ? "yes" : "no"}, skip_supabase: ${report.skip_supabase ? "yes" : "no"}`,
    `- steps: ${report.steps.map((s) => `${s.name}:${s.ok ? "ok" : "fail"}`).join(", ")}`,
    `- report: ${paths.report}`,
    `- latest: ${paths.latestMd}`,
  ];
  if (report.failure_step) {
    base.push(`- failed_step: ${report.failure_step.name} (exit=${report.failure_step.exit_code})`);
    const tail = (report.failure_step.stderr_tail || report.failure_step.stdout_tail || []).slice(-5);
    if (tail.length) base.push(`- tail: ${tail.join(" | ")}`);
  }
  return base.join("\n");
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
  const noDiscord = hasFlag("--no-discord");
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

  const pathSummary = {
    report: path.relative(ROOT, reportPath).replace(/\\/g, "/"),
    reportMd: path.relative(ROOT, mdPath).replace(/\\/g, "/"),
    latestJson: path.relative(ROOT, latestJsonPath).replace(/\\/g, "/"),
    latestMd: path.relative(ROOT, latestMdPath).replace(/\\/g, "/"),
  };

  let discord = { enabled: !noDiscord, sent: false, reason: "disabled" };
  if (!noDiscord) {
    const message = buildDiscordMessage(report, pathSummary);
    postDiscordWebhook(message)
      .then((r) => {
        discord = { enabled: true, ...r };
      })
      .catch((err) => {
        discord = { enabled: true, sent: false, reason: err instanceof Error ? err.message : String(err) };
      })
      .finally(() => {
        console.log(JSON.stringify({
          ...report,
          report_path: pathSummary.report,
          report_md_path: pathSummary.reportMd,
          latest_json_path: pathSummary.latestJson,
          latest_md_path: pathSummary.latestMd,
          discord,
        }, null, 2));
        if (status !== "pass") process.exit(1);
      });
    return;
  }

  console.log(JSON.stringify({
    ...report,
    report_path: pathSummary.report,
    report_md_path: pathSummary.reportMd,
    latest_json_path: pathSummary.latestJson,
    latest_md_path: pathSummary.latestMd,
    discord,
  }, null, 2));

  if (status !== "pass") process.exit(1);
}

main();
