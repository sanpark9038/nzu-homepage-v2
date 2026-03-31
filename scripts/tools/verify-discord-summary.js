const fs = require("fs");
const path = require("path");
const {
  buildDiscordSummaryCheck,
  readJsonIfExists,
} = require("./lib/discord-summary");

const ROOT = path.resolve(__dirname, "..", "..");
const DEFAULT_REPORTS_DIR = path.join(ROOT, "tmp", "reports");
const DEFAULT_BASELINE_PATH = path.join(DEFAULT_REPORTS_DIR, "manual_refresh_baseline.json");
const DEFAULT_PROJECTS_DIR = path.join(ROOT, "data", "metadata", "projects");

function argValue(flag, fallback = null) {
  const idx = process.argv.indexOf(flag);
  if (idx >= 0 && process.argv[idx + 1]) return process.argv[idx + 1];
  return fallback;
}

function hasFlag(flag) {
  return process.argv.includes(flag);
}

function resolveReportsDir() {
  const input = String(argValue("--reports-dir", DEFAULT_REPORTS_DIR) || "").trim();
  return path.resolve(input);
}

function resolveFilePath(value, fallback) {
  const text = String(value || "").trim();
  if (!text) return fallback;
  return path.resolve(text);
}

function latestFileByPrefix(reportsDir, prefix) {
  if (!fs.existsSync(reportsDir)) return null;
  const files = fs
    .readdirSync(reportsDir)
    .filter((n) => n.startsWith(prefix) && n.endsWith(".json"))
    .map((name) => {
      const full = path.join(reportsDir, name);
      return { full, mtime: fs.statSync(full).mtimeMs };
    })
    .sort((a, b) => b.mtime - a.mtime);
  return files.length ? files[0].full : null;
}

function relativePath(filePath) {
  return path.relative(ROOT, filePath).replace(/\\/g, "/");
}

function toMarkdown(summary) {
  const lines = [
    "## Discord Summary Check",
    "",
    `- Snapshot: \`${summary.snapshot}\``,
    `- Alerts: \`${summary.alerts}\``,
    `- Supabase Sync: ${
      summary.supabase_sync === true
        ? "enabled"
        : summary.supabase_sync === false
          ? "disabled (collect-only)"
          : "unknown"
    }`,
    `- Period: ${summary.period_from || "-"} ~ ${summary.period_to || "-"}`,
    `- Previous Snapshot: ${summary.previous_snapshot || "-"}`,
    `- Comparable: ${summary.delta_reference && summary.delta_reference.comparable ? "yes" : "no"}`,
    `- New Matches Total: ${summary.discord_summary_check.new_matches_total}`,
  ];

  const joiners = Array.isArray(summary.discord_summary_check.joiners)
    ? summary.discord_summary_check.joiners
    : [];
  const alerts = summary.discord_summary_check.alerts || { counts: {}, alerts: [] };
  const topTeamDeltas = Array.isArray(summary.discord_summary_check.top_team_deltas)
    ? summary.discord_summary_check.top_team_deltas
    : [];

  lines.push(
    `- Alerts Count: critical ${alerts.counts.critical || 0}, high ${alerts.counts.high || 0}, medium ${alerts.counts.medium || 0}, low ${alerts.counts.low || 0}`
  );

  if (joiners.length) {
    lines.push("");
    lines.push("### Joiners");
    for (const row of joiners) {
      lines.push(`- ${row.player_name} (${row.team_name})`);
    }
  }

  if (topTeamDeltas.length) {
    lines.push("");
    lines.push("### Top Team Match Deltas");
    for (const row of topTeamDeltas) {
      lines.push(`- ${row.team} (${row.team_code}): +${row.delta_total_matches} matches`);
    }
  }

  if (Array.isArray(alerts.alerts) && alerts.alerts.length) {
    lines.push("");
    lines.push("### Alerts");
    for (const row of alerts.alerts) {
      lines.push(`- [${row.severity}] ${row.team} (${row.team_code}) ${row.rule}: ${row.message}`);
    }
  }

  return lines.join("\n");
}

function main() {
  const reportsDir = resolveReportsDir();
  const baselinePath = resolveFilePath(argValue("--baseline", ""), path.join(reportsDir, "manual_refresh_baseline.json"));
  const projectsDir = resolveFilePath(argValue("--projects-dir", ""), DEFAULT_PROJECTS_DIR);
  const manualRefreshPath = path.join(reportsDir, "manual_refresh_latest.json");

  const snapshotPath = resolveFilePath(
    argValue("--snapshot", ""),
    latestFileByPrefix(reportsDir, "daily_pipeline_snapshot_")
  );
  const alertsPath = resolveFilePath(
    argValue("--alerts", ""),
    latestFileByPrefix(reportsDir, "daily_pipeline_alerts_")
  );

  if (!snapshotPath || !alertsPath) {
    console.error("Missing snapshot or alerts file.");
    process.exit(1);
  }

  const snapshot = readJsonIfExists(snapshotPath);
  const alertsDoc = readJsonIfExists(alertsPath);
  const manualRefresh = readJsonIfExists(manualRefreshPath);
  if (!snapshot || !alertsDoc) {
    console.error("Unable to read snapshot or alerts JSON.");
    process.exit(1);
  }

  const deltaReference =
    snapshot && snapshot.delta_reference && typeof snapshot.delta_reference === "object"
      ? snapshot.delta_reference
      : null;
  const summaryCheck = buildDiscordSummaryCheck({
    reportsDir,
    baselinePath,
    projectsDir,
    snapshot,
    alertsDoc,
  });

  const output = {
    snapshot: relativePath(snapshotPath),
    alerts: relativePath(alertsPath),
    baseline: fs.existsSync(baselinePath) ? relativePath(baselinePath) : null,
    generated_at: snapshot.generated_at || null,
    supabase_sync:
      manualRefresh && typeof manualRefresh.with_supabase_sync === "boolean"
        ? manualRefresh.with_supabase_sync
        : null,
    period_from: snapshot.period_from || null,
    period_to: snapshot.period_to || null,
    previous_snapshot: snapshot.previous_snapshot || null,
    delta_reference: deltaReference,
    discord_summary_check: summaryCheck,
  };

  if (hasFlag("--markdown")) {
    console.log(toMarkdown(output));
    return;
  }

  console.log(JSON.stringify(output, null, 2));
}

main();
