const fs = require("fs");
const path = require("path");
const { spawnSync } = require("child_process");

const ROOT = path.resolve(__dirname, "..", "..");
const NODE_BIN = process.execPath || "node";
const PROJECTS_DIR = path.join(ROOT, "data", "metadata", "projects");
const REPORTS_DIR = path.join(ROOT, "tmp", "reports");
const BASELINE_PATH = path.join(REPORTS_DIR, "manual_refresh_baseline.json");
const REPORT_LATEST_PATH = path.join(REPORTS_DIR, "manual_refresh_latest.json");
const REPORT_LATEST_MD_PATH = path.join(REPORTS_DIR, "manual_refresh_latest.md");

function ensureDir(dirPath) {
  fs.mkdirSync(dirPath, { recursive: true });
}

function readJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, "utf8").replace(/^\uFEFF/, ""));
}

function captureRosterBaseline() {
  ensureDir(REPORTS_DIR);
  const teams = [];
  if (!fs.existsSync(PROJECTS_DIR)) {
    fs.writeFileSync(
      BASELINE_PATH,
      JSON.stringify({ generated_at: new Date().toISOString(), teams }, null, 2),
      "utf8"
    );
    return;
  }

  const dirs = fs
    .readdirSync(PROJECTS_DIR, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => entry.name)
    .sort((a, b) => String(a).localeCompare(String(b)));

  for (const code of dirs) {
    const filePath = path.join(PROJECTS_DIR, code, `players.${code}.v1.json`);
    if (!fs.existsSync(filePath)) continue;
    const doc = readJson(filePath);
    const roster = Array.isArray(doc.roster) ? doc.roster : [];
    teams.push({
      team_code: String(doc.team_code || code),
      team_name: String(doc.team_name || code),
      players: roster.map((player) => ({
        entity_id: String(player.entity_id || ""),
        name: String(player.name || ""),
        display_name: String(player.display_name || player.name || ""),
        team_code: String(player.team_code || doc.team_code || code),
        team_name: String(player.team_name || doc.team_name || code),
        tier: String(player.tier || ""),
        last_changed_at: player.last_changed_at || null,
      })),
    });
  }

  fs.writeFileSync(
    BASELINE_PATH,
    JSON.stringify(
      {
        generated_at: new Date().toISOString(),
        teams,
      },
      null,
      2
    ),
    "utf8"
  );
}

function runStep(name, scriptRelPath, args = []) {
  const startedAt = new Date().toISOString();
  console.log(`[RUN] ${name}`);
  const res = spawnSync(NODE_BIN, [scriptRelPath, ...args], {
    cwd: ROOT,
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
    maxBuffer: 64 * 1024 * 1024,
  });
  const endedAt = new Date().toISOString();
  const stdout = String(res.stdout || "");
  const stderr = String(res.stderr || "");
  if (stdout) process.stdout.write(stdout);
  if (stderr) process.stderr.write(stderr);
  const step = {
    name,
    command: `${NODE_BIN} ${[scriptRelPath, ...args].join(" ")}`,
    started_at: startedAt,
    ended_at: endedAt,
    exit_code: res.status,
    ok: res.status === 0,
    stdout_tail: tailLines(stdout),
    stderr_tail: tailLines(stderr),
  };
  if (res.status !== 0) {
    throw Object.assign(new Error(`${name} failed (exit=${res.status}) ${startedAt} -> ${endedAt}`), { step });
  }
  console.log(`[OK] ${name}`);
  return step;
}

function tailLines(text, count = 20) {
  return String(text || "")
    .split(/\r?\n/)
    .map((line) => line.trimEnd())
    .filter(Boolean)
    .slice(-count);
}

function timestampInSeoul() {
  const formatter = new Intl.DateTimeFormat("sv-SE", {
    timeZone: "Asia/Seoul",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
  });
  const parts = Object.fromEntries(
    formatter.formatToParts(new Date()).map((part) => [part.type, part.value])
  );
  return `${parts.year}-${parts.month}-${parts.day}_${parts.hour}${parts.minute}${parts.second}`;
}

function writeReport(report) {
  ensureDir(REPORTS_DIR);
  const stamp = timestampInSeoul();
  const jsonPath = path.join(REPORTS_DIR, `manual_refresh_report_${stamp}.json`);
  const mdPath = path.join(REPORTS_DIR, `manual_refresh_report_${stamp}.md`);
  fs.writeFileSync(jsonPath, JSON.stringify(report, null, 2), "utf8");
  fs.writeFileSync(REPORT_LATEST_PATH, JSON.stringify(report, null, 2), "utf8");
  fs.writeFileSync(mdPath, buildMarkdownSummary(report, path.relative(ROOT, jsonPath).replace(/\\/g, "/")), "utf8");
  fs.writeFileSync(
    REPORT_LATEST_MD_PATH,
    buildMarkdownSummary(report, path.relative(ROOT, jsonPath).replace(/\\/g, "/")),
    "utf8"
  );
}

function buildMarkdownSummary(report, reportPath) {
  const lines = [
    "# Manual Refresh Report",
    "",
    `- Generated: ${report.generated_at}`,
    `- Status: **${String(report.status || "").toUpperCase()}**`,
    `- JSON Report: ${reportPath}`,
    "",
    "## Steps",
  ];

  for (const step of report.steps || []) {
    lines.push(`- ${step.name}: ${step.ok ? "ok" : "fail"} (exit=${step.exit_code})`);
  }

  if (report.failure_step) {
    lines.push("");
    lines.push("## Failure Detail");
    lines.push(`- Failed Step: ${report.failure_step.name}`);
    lines.push(`- Command: \`${report.failure_step.command}\``);
    for (const row of report.failure_step.stderr_tail || []) {
      lines.push(`- stderr: ${row}`);
    }
    if (!(report.failure_step.stderr_tail || []).length) {
      for (const row of report.failure_step.stdout_tail || []) {
        lines.push(`- stdout: ${row}`);
      }
    }
  }

  return lines.join("\n");
}

function main() {
  const steps = [];
  let status = "pass";
  let errorMessage = null;
  let failureStep = null;

  captureRosterBaseline();
  try {
    steps.push(
      runStep("collect_chunked", "scripts/tools/run-ops-pipeline-chunked.js", [
        "--chunk-size",
        "3",
        "--inactive-skip-days",
        "14",
      ])
    );
    steps.push(runStep("supabase_push", "scripts/tools/push-supabase-approved.js", ["--approved"]));
    console.log("Done: manual refresh completed.");
  } catch (error) {
    status = "fail";
    errorMessage = error instanceof Error ? error.message : String(error);
    failureStep = error && error.step ? error.step : null;
    if (failureStep) steps.push(failureStep);
  }

  writeReport({
    generated_at: new Date().toISOString(),
    status,
    error: errorMessage,
    steps,
    failure_step: failureStep,
    baseline_path: path.relative(ROOT, BASELINE_PATH).replace(/\\/g, "/"),
  });

  if (status !== "pass") {
    process.exit(1);
  }
}

main();
