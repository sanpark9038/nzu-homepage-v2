const fs = require("fs");
const path = require("path");

const { DEFAULT_RETENTION_DAYS, pruneReports } = require("./prune-tmp-reports");

const ROOT = path.resolve(__dirname, "..", "..");
const REPORTS_DIR = path.join(ROOT, "tmp", "reports");

function argValue(flag, fallback = null) {
  const idx = process.argv.indexOf(flag);
  if (idx >= 0 && process.argv[idx + 1]) return process.argv[idx + 1];
  return fallback;
}

function normalizeRetentionDays(value) {
  const num = Number(value);
  if (!Number.isFinite(num) || num < 1) return DEFAULT_RETENTION_DAYS;
  return Math.floor(num);
}

function walkReports(dirPath, relativeDir = "") {
  if (!fs.existsSync(dirPath)) return [];

  return fs.readdirSync(dirPath, { withFileTypes: true }).flatMap((entry) => {
    const absPath = path.join(dirPath, entry.name);
    const relPath = relativeDir ? path.join(relativeDir, entry.name) : entry.name;

    if (entry.isDirectory()) {
      return walkReports(absPath, relPath);
    }

    if (!entry.isFile()) return [];

    const stats = fs.statSync(absPath);
    return [
      {
        name: entry.name,
        absPath,
        relPath,
        rootBucket: relPath.split(path.sep)[0],
        sizeBytes: stats.size,
        lastModifiedMs: stats.mtimeMs,
      },
    ];
  });
}

function toIsoOrNull(value) {
  if (!Number.isFinite(value)) return null;
  return new Date(value).toISOString();
}

function formatBytes(bytes) {
  if (!Number.isFinite(bytes) || bytes <= 0) return "0 B";
  const units = ["B", "KB", "MB", "GB"];
  let index = 0;
  let value = bytes;
  while (value >= 1024 && index < units.length - 1) {
    value /= 1024;
    index += 1;
  }
  return `${value.toFixed(value >= 100 || index === 0 ? 0 : 2)} ${units[index]}`;
}

function buildBucketSummary(files) {
  const buckets = new Map();

  for (const file of files) {
    const current = buckets.get(file.rootBucket) || {
      name: file.rootBucket,
      file_count: 0,
      total_bytes: 0,
      latest_modified_at: null,
    };
    current.file_count += 1;
    current.total_bytes += file.sizeBytes;
    current.latest_modified_at =
      !current.latest_modified_at || current.latest_modified_at < file.lastModifiedMs
        ? file.lastModifiedMs
        : current.latest_modified_at;
    buckets.set(file.rootBucket, current);
  }

  return [...buckets.values()]
    .sort((a, b) => b.total_bytes - a.total_bytes)
    .map((bucket) => ({
      ...bucket,
      latest_modified_at: toIsoOrNull(bucket.latest_modified_at),
      human_size: formatBytes(bucket.total_bytes),
    }));
}

function summarizeReportsFootprint({ reportsDir = REPORTS_DIR, retentionDays = DEFAULT_RETENTION_DAYS, nowMs = Date.now() } = {}) {
  const files = walkReports(reportsDir);
  const pruneSummary = pruneReports({ apply: false, retentionDays, nowMs, reportsDir });
  const rootFiles = files.filter((file) => !file.relPath.includes(path.sep));
  const nestedFiles = files.length - rootFiles.length;
  const latestModifiedMs = files.reduce((acc, file) => Math.max(acc, file.lastModifiedMs), 0);
  const oldestModifiedMs = files.reduce(
    (acc, file) => (acc === 0 ? file.lastModifiedMs : Math.min(acc, file.lastModifiedMs)),
    0
  );
  const totalBytes = files.reduce((acc, file) => acc + file.sizeBytes, 0);

  return {
    generated_at: new Date(nowMs).toISOString(),
    reports_dir: reportsDir,
    retention_days: retentionDays,
    total_files: files.length,
    root_files: rootFiles.length,
    nested_files: nestedFiles,
    total_bytes: totalBytes,
    total_size_human: formatBytes(totalBytes),
    oldest_modified_at: toIsoOrNull(oldestModifiedMs),
    latest_modified_at: toIsoOrNull(latestModifiedMs),
    prune_candidates: pruneSummary.deleted_files,
    prune_reclaimable_bytes: pruneSummary.reclaimed_bytes,
    prune_reclaimable_human: formatBytes(pruneSummary.reclaimed_bytes),
    largest_root_buckets: buildBucketSummary(files).slice(0, 12),
    oldest_prune_candidates: pruneSummary.deleted.slice(0, 12),
  };
}

function main() {
  const retentionDays = normalizeRetentionDays(argValue("--retention-days", DEFAULT_RETENTION_DAYS));
  const summary = summarizeReportsFootprint({ retentionDays });
  console.log(JSON.stringify(summary, null, 2));
}

if (require.main === module) {
  main();
}

module.exports = {
  REPORTS_DIR,
  buildBucketSummary,
  formatBytes,
  summarizeReportsFootprint,
  walkReports,
};
