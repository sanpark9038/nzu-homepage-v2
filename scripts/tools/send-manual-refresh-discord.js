const fs = require("fs");
const path = require("path");
require("dotenv").config({ path: path.join(__dirname, "..", "..", ".env.local") });

const ROOT = path.resolve(__dirname, "..", "..");
const REPORTS_DIR = path.join(ROOT, "tmp", "reports");

function argValue(flag, fallback = null) {
  const idx = process.argv.indexOf(flag);
  if (idx >= 0 && process.argv[idx + 1]) return process.argv[idx + 1];
  return fallback;
}

function latestFileByPrefix(prefix) {
  if (!fs.existsSync(REPORTS_DIR)) return null;
  const files = fs
    .readdirSync(REPORTS_DIR)
    .filter((n) => n.startsWith(prefix) && n.endsWith(".json"))
    .map((name) => {
      const full = path.join(REPORTS_DIR, name);
      return { full, name, mtime: fs.statSync(full).mtimeMs };
    })
    .sort((a, b) => b.mtime - a.mtime);
  return files.length ? files[0].full : null;
}

function readJsonIfExists(filePath) {
  if (!filePath || !fs.existsSync(filePath)) return null;
  return JSON.parse(fs.readFileSync(filePath, "utf8").replace(/^\uFEFF/, ""));
}

function sumBy(rows, key) {
  return rows.reduce((acc, row) => acc + (Number(row && row[key] ? row[key] : 0) || 0), 0);
}

function buildMessage({ outcome, source, runUrl }) {
  const snapshotPath = latestFileByPrefix("daily_pipeline_snapshot_");
  const alertsPath = latestFileByPrefix("daily_pipeline_alerts_");
  const chunkedPath = path.join(REPORTS_DIR, "ops_pipeline_chunked_latest.json");

  const snapshot = readJsonIfExists(snapshotPath);
  const alertsDoc = readJsonIfExists(alertsPath);
  const chunked = readJsonIfExists(chunkedPath);
  const teams = Array.isArray(snapshot && snapshot.teams) ? snapshot.teams : [];
  const alerts = Array.isArray(alertsDoc && alertsDoc.alerts) ? alertsDoc.alerts : [];

  const fetched = sumBy(teams, "fetched_players");
  const reused = sumBy(teams, "reused_players");
  const fetchFail = sumBy(teams, "fetch_fail");
  const csvFail = sumBy(teams, "csv_fail");
  const totalPlayers = sumBy(teams, "players");
  const totalMatches = sumBy(teams, "total_matches");
  const zeroPlayers = sumBy(teams, "zero_record_players");
  const changedTeams = Array.isArray(chunked && chunked.teams) ? chunked.teams.length : teams.length;
  const elapsedSeconds = Number(chunked && chunked.elapsed_seconds ? chunked.elapsed_seconds : 0) || 0;
  const crit = alerts.filter((a) => a.severity === "critical").length;
  const high = alerts.filter((a) => a.severity === "high").length;
  const med = alerts.filter((a) => a.severity === "medium").length;
  const low = alerts.filter((a) => a.severity === "low").length;
  const topAlerts = alerts.slice(0, 3).map((a) => `${a.team_code}:${a.rule}`);

  const icon = outcome === "success" ? "✅" : "❌";
  const lines = [
    `${icon} NZU Manual Refresh ${outcome.toUpperCase()}`,
    `- source: ${source}`,
    `- generated: ${snapshot && snapshot.generated_at ? snapshot.generated_at : new Date().toISOString()}`,
    `- teams: ${changedTeams}, players: ${totalPlayers}, total_matches: ${totalMatches}`,
    `- fetched: ${fetched}, reused: ${reused}, fetch_fail: ${fetchFail}, csv_fail: ${csvFail}`,
    `- alerts c/h/m/l: ${crit}/${high}/${med}/${low}`,
    `- zero_record_players: ${zeroPlayers}`,
  ];

  if (elapsedSeconds > 0) {
    lines.push(`- elapsed_seconds: ${Math.round(elapsedSeconds)}`);
  }
  if (topAlerts.length) {
    lines.push(`- top_alerts: ${topAlerts.join(", ")}`);
  }
  if (runUrl) {
    lines.push(`- run: ${runUrl}`);
  }

  return lines.join("\n");
}

async function postDiscordWebhook(content) {
  const webhook =
    process.env.OPS_DISCORD_WEBHOOK_URL ||
    process.env.DISCORD_WEBHOOK_URL ||
    "";
  if (!String(webhook).trim()) {
    console.log("Discord webhook missing. Skip notification.");
    return;
  }

  const res = await fetch(webhook, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ content }),
  });

  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new Error(`Discord webhook failed: ${res.status} ${body}`);
  }
}

async function main() {
  const outcome = String(argValue("--outcome", "success")).trim().toLowerCase();
  const source = String(argValue("--source", "manual-refresh")).trim();
  const runUrl = String(argValue("--run-url", "")).trim();
  const message = buildMessage({ outcome, source, runUrl });
  await postDiscordWebhook(message);
  console.log(message);
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
});
