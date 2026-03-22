const fs = require("fs");
const path = require("path");

const ROOT = path.resolve(__dirname, "..", "..");
const REPORTS_DIR = path.join(ROOT, "tmp", "reports");

function latestFileByPrefix(prefix) {
  if (!fs.existsSync(REPORTS_DIR)) return null;
  const files = fs
    .readdirSync(REPORTS_DIR)
    .filter((n) => n.startsWith(prefix) && n.endsWith(".json"));
  if (!files.length) return null;
  let latest = null;
  let latestMtime = -1;
  for (const name of files) {
    const full = path.join(REPORTS_DIR, name);
    const mtime = fs.statSync(full).mtimeMs;
    if (mtime > latestMtime) {
      latestMtime = mtime;
      latest = full;
    }
  }
  return latest;
}

function readJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, "utf8").replace(/^\uFEFF/, ""));
}

function main() {
  const snapshotPath = latestFileByPrefix("daily_pipeline_snapshot_");
  const alertsPath = latestFileByPrefix("daily_pipeline_alerts_");
  if (!snapshotPath || !alertsPath) {
    console.error("Missing daily pipeline reports.");
    process.exit(1);
  }

  const snapshot = readJson(snapshotPath);
  const alertsDoc = readJson(alertsPath);
  const teams = Array.isArray(snapshot.teams) ? snapshot.teams : [];
  const alerts = Array.isArray(alertsDoc.alerts) ? alertsDoc.alerts : [];

  const critical = alerts.filter((a) => a.severity === "critical").length;
  const high = alerts.filter((a) => a.severity === "high").length;
  const medium = alerts.filter((a) => a.severity === "medium").length;
  const low = alerts.filter((a) => a.severity === "low").length;

  console.log(`snapshot: ${path.relative(ROOT, snapshotPath)}`);
  console.log(`alerts:   ${path.relative(ROOT, alertsPath)}`);
  console.log(`generated_at: ${snapshot.generated_at || "-"}`);
  console.log(`period: ${snapshot.period_from || "-"} ~ ${snapshot.period_to || "-"}`);
  console.log(
    `alerts critical/high/medium/low: ${critical}/${high}/${medium}/${low}`
  );

  const table = teams.map((t) => ({
    team: t.team,
    players: t.players,
    fetched_players: t.fetched_players ?? "",
    reused_players: t.reused_players ?? "",
    fetch_fail: t.fetch_fail,
    csv_fail: t.csv_fail,
    zero_record_players: t.zero_record_players,
    total_matches: t.total_matches,
    delta_total_matches:
      typeof t.delta_total_matches === "number" ? t.delta_total_matches : "",
  }));
  console.table(table);

  const hasBlocking = critical > 0 || high > 0;
  if (hasBlocking) {
    process.exitCode = 1;
    console.error("Blocking alerts detected (critical/high).");
  }
}

main();
