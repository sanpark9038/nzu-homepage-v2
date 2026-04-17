const fs = require("fs");
const path = require("path");

const ROOT = path.resolve(__dirname, "..", "..");
const REPORTS_DIR = path.join(ROOT, "tmp", "reports");
const DEFAULT_RETENTION_DAYS = 14;

const ALWAYS_KEEP = new Set([
  "artifact_organization_report.json",
  "homepage_integrity_report.json",
  "manual_refresh_baseline.json",
  "team_auto_discovery_report.json",
  "team_roster_sync_report.json",
]);

function argValue(flag, fallback = null) {
  const idx = process.argv.indexOf(flag);
  if (idx >= 0 && process.argv[idx + 1]) return process.argv[idx + 1];
  return fallback;
}

function hasFlag(flag) {
  return process.argv.includes(flag);
}

function normalizeRetentionDays(value) {
  const num = Number(value);
  if (!Number.isFinite(num) || num < 1) return DEFAULT_RETENTION_DAYS;
  return Math.floor(num);
}

function shouldAlwaysKeep(fileName) {
  if (ALWAYS_KEEP.has(fileName)) return true;
  if (/_latest\.(json|md)$/i.test(fileName)) return true;
  return false;
}

function buildDecision(entry, retentionDays, nowMs = Date.now()) {
  const ageMs = nowMs - entry.lastModifiedMs;
  const ageDays = ageMs / (24 * 60 * 60 * 1000);
  const keep = shouldAlwaysKeep(entry.name) || ageDays < retentionDays;
  return {
    ...entry,
    ageDays: Number(ageDays.toFixed(2)),
    keep,
  };
}

function listReportFiles(dirPath = REPORTS_DIR) {
  if (!fs.existsSync(dirPath)) return [];
  return fs
    .readdirSync(dirPath, { withFileTypes: true })
    .filter((entry) => entry.isFile())
    .map((entry) => {
      const filePath = path.join(dirPath, entry.name);
      const stats = fs.statSync(filePath);
      return {
        name: entry.name,
        path: filePath,
        sizeBytes: stats.size,
        lastModifiedMs: stats.mtimeMs,
      };
    });
}

function pruneReports({
  apply = false,
  retentionDays = DEFAULT_RETENTION_DAYS,
  nowMs = Date.now(),
  reportsDir = REPORTS_DIR,
} = {}) {
  const files = listReportFiles(reportsDir);
  const decisions = files.map((entry) => buildDecision(entry, retentionDays, nowMs));
  const toDelete = decisions.filter((entry) => !entry.keep);

  if (apply) {
    for (const entry of toDelete) {
      fs.unlinkSync(entry.path);
    }
  }

  return {
    generated_at: new Date(nowMs).toISOString(),
    reports_dir: reportsDir,
    retention_days: retentionDays,
    apply,
    total_files: decisions.length,
    kept_files: decisions.filter((entry) => entry.keep).length,
    deleted_files: toDelete.length,
    reclaimed_bytes: toDelete.reduce((acc, entry) => acc + Number(entry.sizeBytes || 0), 0),
    deleted: toDelete
      .sort((a, b) => b.ageDays - a.ageDays)
      .map((entry) => ({
        name: entry.name,
        age_days: entry.ageDays,
        size_bytes: entry.sizeBytes,
      })),
  };
}

function main() {
  const apply = hasFlag("--apply");
  const retentionDays = normalizeRetentionDays(argValue("--retention-days", DEFAULT_RETENTION_DAYS));
  const summary = pruneReports({ apply, retentionDays });
  console.log(JSON.stringify(summary, null, 2));
  if (!apply) {
    console.log("dry-run: pass --apply to delete old report files");
  }
}

if (require.main === module) {
  main();
}

module.exports = {
  ALWAYS_KEEP,
  DEFAULT_RETENTION_DAYS,
  buildDecision,
  normalizeRetentionDays,
  pruneReports,
  shouldAlwaysKeep,
};
