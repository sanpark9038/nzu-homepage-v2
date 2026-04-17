const fs = require("fs");
const path = require("path");

const ROOT = path.resolve(__dirname, "..", "..");
const REPORTS_DIR = path.join(ROOT, "tmp", "reports");
const DEFAULT_RETENTION_DAYS = 7;

const EPHEMERAL_DIR_PATTERNS = [
  /^gha_\d+(?:_.+)?$/i,
  /^gh-run-\d+(?:-.+)?$/i,
  /^run_\d+_job_logs$/i,
];

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

function isEphemeralArtifactDir(name) {
  return EPHEMERAL_DIR_PATTERNS.some((pattern) => pattern.test(name));
}

function directorySizeBytes(dirPath) {
  if (!fs.existsSync(dirPath)) return 0;

  return fs.readdirSync(dirPath, { withFileTypes: true }).reduce((acc, entry) => {
    const fullPath = path.join(dirPath, entry.name);
    if (entry.isDirectory()) return acc + directorySizeBytes(fullPath);
    if (!entry.isFile()) return acc;
    return acc + fs.statSync(fullPath).size;
  }, 0);
}

function removeDirectoryRecursive(dirPath) {
  fs.rmSync(dirPath, { recursive: true, force: true });
}

function formatBytes(bytes) {
  if (!Number.isFinite(bytes) || bytes <= 0) return "0 B";
  const units = ["B", "KB", "MB", "GB"];
  let value = bytes;
  let unitIndex = 0;
  while (value >= 1024 && unitIndex < units.length - 1) {
    value /= 1024;
    unitIndex += 1;
  }
  return `${value.toFixed(value >= 100 || unitIndex === 0 ? 0 : 2)} ${units[unitIndex]}`;
}

function listArtifactDirectories(reportsDir = REPORTS_DIR) {
  if (!fs.existsSync(reportsDir)) return [];

  return fs
    .readdirSync(reportsDir, { withFileTypes: true })
    .filter((entry) => entry.isDirectory() && isEphemeralArtifactDir(entry.name))
    .map((entry) => {
      const fullPath = path.join(reportsDir, entry.name);
      const stats = fs.statSync(fullPath);
      return {
        name: entry.name,
        path: fullPath,
        lastModifiedMs: stats.mtimeMs,
        sizeBytes: directorySizeBytes(fullPath),
      };
    });
}

function buildDecision(entry, retentionDays, nowMs = Date.now()) {
  const ageMs = nowMs - entry.lastModifiedMs;
  const ageDays = ageMs / (24 * 60 * 60 * 1000);
  return {
    ...entry,
    ageDays: Number(ageDays.toFixed(2)),
    keep: ageDays < retentionDays,
  };
}

function pruneArtifactDirectories({
  apply = false,
  retentionDays = DEFAULT_RETENTION_DAYS,
  nowMs = Date.now(),
  reportsDir = REPORTS_DIR,
} = {}) {
  const directories = listArtifactDirectories(reportsDir);
  const decisions = directories.map((entry) => buildDecision(entry, retentionDays, nowMs));
  const toDelete = decisions.filter((entry) => !entry.keep);

  if (apply) {
    for (const entry of toDelete) {
      removeDirectoryRecursive(entry.path);
    }
  }

  return {
    generated_at: new Date(nowMs).toISOString(),
    reports_dir: reportsDir,
    retention_days: retentionDays,
    apply,
    total_artifact_dirs: decisions.length,
    kept_artifact_dirs: decisions.filter((entry) => entry.keep).length,
    deleted_artifact_dirs: toDelete.length,
    reclaimed_bytes: toDelete.reduce((acc, entry) => acc + entry.sizeBytes, 0),
    reclaimed_human: formatBytes(toDelete.reduce((acc, entry) => acc + entry.sizeBytes, 0)),
    deleted: toDelete
      .sort((a, b) => b.ageDays - a.ageDays)
      .map((entry) => ({
        name: entry.name,
        age_days: entry.ageDays,
        size_bytes: entry.sizeBytes,
        size_human: formatBytes(entry.sizeBytes),
      })),
  };
}

function main() {
  const retentionDays = normalizeRetentionDays(argValue("--retention-days", DEFAULT_RETENTION_DAYS));
  const apply = hasFlag("--apply");
  const summary = pruneArtifactDirectories({ apply, retentionDays });
  console.log(JSON.stringify(summary, null, 2));
  if (!apply) {
    console.log("dry-run: pass --apply to delete stale artifact directories");
  }
}

if (require.main === module) {
  main();
}

module.exports = {
  DEFAULT_RETENTION_DAYS,
  EPHEMERAL_DIR_PATTERNS,
  buildDecision,
  formatBytes,
  isEphemeralArtifactDir,
  listArtifactDirectories,
  pruneArtifactDirectories,
};
