const fs = require("fs");
const path = require("path");
const { spawnSync } = require("child_process");
require("dotenv").config({ path: path.join(__dirname, "..", "..", ".env.local") });

const ROOT = path.resolve(__dirname, "..", "..");
const REPORT_DIR = path.join(ROOT, "tmp", "reports");
const NODE_BIN = process.execPath || "node";
const NODE_BIN_FALLBACK = "node";
const DAILY_PIPELINE_TIMEOUT_MS = 60 * 60 * 1000;
const SOOP_SNAPSHOT_TIMEOUT_MS = 5 * 60 * 1000;
const HOMEPAGE_INTEGRITY_TIMEOUT_MS = 10 * 60 * 1000;
const WAREHOUSE_VERIFY_TIMEOUT_MS = 5 * 60 * 1000;
const SUPABASE_SYNC_TIMEOUT_MS = 30 * 60 * 1000;

function hasFlag(flag) {
  return process.argv.includes(flag);
}

function argValue(flag, fallback = null) {
  const idx = process.argv.indexOf(flag);
  if (idx >= 0 && process.argv[idx + 1]) return process.argv[idx + 1];
  return fallback;
}

function appendArgIfPresent(args, flag, value) {
  if (value === null || value === undefined) return;
  const text = String(value).trim();
  if (!text) return;
  args.push(flag, text);
}

function timestamp() {
  const d = new Date();
  const p = (n) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}_${p(d.getHours())}${p(d.getMinutes())}${p(d.getSeconds())}`;
}

function stepTimeoutFor(name) {
  if (name === "soop_live_snapshot") return SOOP_SNAPSHOT_TIMEOUT_MS;
  if (name === "homepage_integrity_report") return HOMEPAGE_INTEGRITY_TIMEOUT_MS;
  if (name === "daily_pipeline") return DAILY_PIPELINE_TIMEOUT_MS;
  if (name === "warehouse_verify") return WAREHOUSE_VERIFY_TIMEOUT_MS;
  if (name === "supabase_staging_sync" || name === "supabase_prod_sync") return SUPABASE_SYNC_TIMEOUT_MS;
  return 30 * 60 * 1000;
}

function hasHomepageIntegrityEnv() {
  const supabaseUrl = String(process.env.NEXT_PUBLIC_SUPABASE_URL || "").trim();
  const serviceKey = String(
    process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_KEY || ""
  ).trim();
  return Boolean(supabaseUrl && serviceKey);
}

function hasSoopSnapshotEnv() {
  return Boolean(String(process.env.SOOP_CLIENT_ID || "").trim());
}

function runStep(name, args, options = {}) {
  const startedAt = new Date().toISOString();
  let usedNodeBin = NODE_BIN;
  const timeoutMs = Number(options.timeoutMs || stepTimeoutFor(name));
  let res = spawnSync(usedNodeBin, args, {
    cwd: ROOT,
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
    maxBuffer: 64 * 1024 * 1024,
    timeout: timeoutMs,
  });
  if (res.error && String(res.error.code || "") === "EPERM" && NODE_BIN !== NODE_BIN_FALLBACK) {
    usedNodeBin = NODE_BIN_FALLBACK;
    res = spawnSync(usedNodeBin, args, {
      cwd: ROOT,
      encoding: "utf8",
      stdio: ["ignore", "pipe", "pipe"],
      maxBuffer: 64 * 1024 * 1024,
      timeout: timeoutMs,
    });
  }
  const endedAt = new Date().toISOString();
  const timedOut = Boolean(res.error && String(res.error.code || "") === "ETIMEDOUT");
  const exitCode = typeof res.status === "number" ? res.status : timedOut ? 124 : 1;
  const ok = exitCode === 0;
  const spawnError =
    res.error && typeof res.error === "object"
      ? `${res.error.code || "spawn_error"}: ${res.error.message || String(res.error)}`
      : "";
  const step = {
    name,
    command: `${usedNodeBin} ${args.join(" ")}`,
    started_at: startedAt,
    ended_at: endedAt,
    exit_code: exitCode,
    ok,
    timeout_ms: timeoutMs,
    timed_out: timedOut,
    stdout: String(res.stdout || "").trim(),
    stderr: [String(res.stderr || "").trim(), spawnError].filter(Boolean).join("\n"),
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

function readJsonIfExists(filePath) {
  if (!fs.existsSync(filePath)) return null;
  return JSON.parse(fs.readFileSync(filePath, "utf8").replace(/^\uFEFF/, ""));
}

function dailySnapshotChangeSummary() {
  if (!fs.existsSync(REPORT_DIR)) return null;
  const files = fs
    .readdirSync(REPORT_DIR)
    .filter((n) => /^daily_pipeline_snapshot_\d{4}-\d{2}-\d{2}\.json$/.test(n))
    .sort();
  if (files.length < 2) return null;

  const currentName = files[files.length - 1];
  const prevName = files[files.length - 2];
  const currentDoc = readJsonIfExists(path.join(REPORT_DIR, currentName));
  const prevDoc = readJsonIfExists(path.join(REPORT_DIR, prevName));
  if (!currentDoc || !prevDoc) return null;

  const prevMap = new Map(
    Array.isArray(prevDoc.teams) ? prevDoc.teams.map((t) => [String(t.team_code || ""), t]) : []
  );
  const rows = [];
  for (const t of Array.isArray(currentDoc.teams) ? currentDoc.teams : []) {
    const code = String(t.team_code || "");
    if (!code || !prevMap.has(code)) continue;
    const p = prevMap.get(code);
    const deltaMatches = Number(t.total_matches || 0) - Number(p.total_matches || 0);
    const deltaPlayers = Number(t.players || 0) - Number(p.players || 0);
    const deltaExcluded = Number(t.excluded_players || 0) - Number(p.excluded_players || 0);
    if (deltaMatches || deltaPlayers || deltaExcluded) {
      rows.push({
        team: String(t.team || code),
        team_code: code,
        delta_matches: deltaMatches,
        delta_players: deltaPlayers,
        delta_excluded: deltaExcluded,
      });
    }
  }

  const notable = rows
    .slice()
    .sort((a, b) => Math.abs(b.delta_matches) - Math.abs(a.delta_matches))
    .slice(0, 5);

  const rosterSummary =
    currentDoc &&
    currentDoc.roster_sync &&
    currentDoc.roster_sync.summary &&
    typeof currentDoc.roster_sync.summary === "object"
      ? currentDoc.roster_sync.summary
      : {};

  return {
    current_snapshot: `tmp/reports/${currentName}`,
    previous_snapshot: `tmp/reports/${prevName}`,
    changed_teams: rows.length,
    notable_teams: notable,
    moved_count: Number(rosterSummary.moved_count || 0),
    added_count: Number(rosterSummary.added_count || 0),
    tier_changed_count: Number(rosterSummary.tier_changed_count || 0),
  };
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
    `${icon} SANPARK SYSTEM Ops Pipeline ${report.status.toUpperCase()}`,
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
  } else if (report.change_summary) {
    base.push(
      `- changes: teams=${report.change_summary.changed_teams}, moved=${report.change_summary.moved_count}, added=${report.change_summary.added_count}, tier_changed=${report.change_summary.tier_changed_count}`
    );
    const top = Array.isArray(report.change_summary.notable_teams)
      ? report.change_summary.notable_teams.slice(0, 3)
      : [];
    if (top.length) {
      base.push(
        `- top_match_deltas: ${top.map((r) => `${r.team_code}:${r.delta_matches > 0 ? "+" : ""}${r.delta_matches}`).join(", ")}`
      );
    }
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
  } else if (report.change_summary) {
    lines.push("");
    lines.push("## Change Summary");
    lines.push(`- Compared: ${report.change_summary.previous_snapshot} -> ${report.change_summary.current_snapshot}`);
    lines.push(`- Changed Teams: ${report.change_summary.changed_teams}`);
    lines.push(
      `- Roster Sync: moved=${report.change_summary.moved_count}, added=${report.change_summary.added_count}, tier_changed=${report.change_summary.tier_changed_count}`
    );
    const top = Array.isArray(report.change_summary.notable_teams)
      ? report.change_summary.notable_teams.slice(0, 5)
      : [];
    for (const row of top) {
      lines.push(
        `- ${row.team_code}: delta_matches=${row.delta_matches > 0 ? "+" : ""}${row.delta_matches}, delta_players=${row.delta_players > 0 ? "+" : ""}${row.delta_players}, delta_excluded=${row.delta_excluded > 0 ? "+" : ""}${row.delta_excluded}`
      );
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
  const withSupabaseSync = hasFlag("--with-supabase-sync");
  const skipSupabase = !withSupabaseSync;
  const dryRun = hasFlag("--dry-run");
  const noDiscord = hasFlag("--no-discord");
  const dateTag = timestamp();
  const dailyArgs = ["scripts/tools/run-daily-pipeline.js"];
  appendArgIfPresent(dailyArgs, "--from", argValue("--from", null));
  appendArgIfPresent(dailyArgs, "--to", argValue("--to", null));
  appendArgIfPresent(dailyArgs, "--date-tag", argValue("--date-tag", null));
  appendArgIfPresent(dailyArgs, "--teams", argValue("--teams", null));
  appendArgIfPresent(dailyArgs, "--concurrency", argValue("--concurrency", null));
  appendArgIfPresent(dailyArgs, "--inactive-skip-days", argValue("--inactive-skip-days", null));
  if (hasFlag("--no-use-existing-json")) dailyArgs.push("--no-use-existing-json");
  if (hasFlag("--no-roster-sync")) dailyArgs.push("--no-roster-sync");
  if (hasFlag("--no-display-alias")) dailyArgs.push("--no-display-alias");
  if (hasFlag("--no-team-table")) dailyArgs.push("--no-team-table");
  if (hasFlag("--no-fa-record-metadata")) dailyArgs.push("--no-fa-record-metadata");
  if (hasFlag("--no-organize")) dailyArgs.push("--no-organize");
  if (hasFlag("--no-strict")) dailyArgs.push("--no-strict");
  const dailyCommand = `node ${dailyArgs.join(" ")}`;

  const steps = [];
  let status = "pass";
  let errorMessage = "";
  let failureStep = null;

  try {
    ensureFile("scripts/tools/run-daily-pipeline.js");
    ensureFile("scripts/tools/verify-warehouse-integrity.js");
    ensureFile("scripts/tools/report-homepage-integrity.js");
    if (!skipSupabase) {
      ensureFile("scripts/tools/supabase-staging-sync.js");
      ensureFile("scripts/tools/supabase-prod-sync.js");
    }

    if (dryRun) {
      steps.push({
        name: "daily_pipeline",
        command: dailyCommand,
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
      if (hasHomepageIntegrityEnv()) {
        if (hasSoopSnapshotEnv()) {
          steps.push(
            runStep("soop_live_snapshot", ["scripts/tools/generate-soop-live-snapshot.js"], {
              timeoutMs: stepTimeoutFor("soop_live_snapshot"),
            })
          );
        }
        steps.push(
          runStep("homepage_integrity_report", ["scripts/tools/report-homepage-integrity.js"], {
            timeoutMs: stepTimeoutFor("homepage_integrity_report"),
            allowFailure: true,
          })
        );
      }
      steps.push(
        runStep("daily_pipeline", dailyArgs)
      );
      steps.push(
        runStep("warehouse_verify", [
          "scripts/tools/verify-warehouse-integrity.js",
          ...(String(argValue("--teams", "")).trim()
            ? ["--teams", String(argValue("--teams", "")).trim()]
            : []),
        ])
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
    change_summary: status === "pass" && !dryRun ? dailySnapshotChangeSummary() : null,
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

if (require.main === module) {
  main();
}

module.exports = {
  stepTimeoutFor,
};
