const fs = require("fs");
const path = require("path");

const ROOT = path.resolve(__dirname, "..", "..");
const TMP_DIR = path.join(ROOT, "tmp");

const REMOVABLE_DIR_NAMES = new Set([
  "exports",
  "ppt_review_images",
  "ppt_review_images_2",
  "gh-actions",
  "artifacts",
]);

const REMOVABLE_DIR_PATTERNS = [
  /^pipeline-reports-\d+$/i,
];

const REMOVABLE_FILE_PATTERNS = [
  /_roster_batch_export_report_repro(?:_after_guard)?\.json$/i,
  /_roster_batch_export_report_repro(?:_after_guard)?\.progress\.jsonl$/i,
  /^localhost_.*\.html$/i,
  /^run-daily-pipeline\.head\d*\.js$/i,
  /^pipeline-reports-\d+\.zip$/i,
  /^codex_daily_alert_fix\.patch$/i,
  /^늪지대_.*$/u,
  /^nzu_.*$/i,
];

function hasFlag(flag) {
  return process.argv.includes(flag);
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

function directorySizeBytes(dirPath) {
  if (!fs.existsSync(dirPath)) return 0;
  return fs.readdirSync(dirPath, { withFileTypes: true }).reduce((acc, entry) => {
    const fullPath = path.join(dirPath, entry.name);
    if (entry.isDirectory()) return acc + directorySizeBytes(fullPath);
    if (!entry.isFile()) return acc;
    return acc + fs.statSync(fullPath).size;
  }, 0);
}

function shouldRemoveDirectory(name) {
  if (REMOVABLE_DIR_NAMES.has(name)) return true;
  return REMOVABLE_DIR_PATTERNS.some((pattern) => pattern.test(name));
}

function shouldRemoveFile(name) {
  return REMOVABLE_FILE_PATTERNS.some((pattern) => pattern.test(name));
}

function listCleanupTargets(tmpDir = TMP_DIR) {
  if (!fs.existsSync(tmpDir)) return [];
  const directoryTargets = fs
    .readdirSync(tmpDir, { withFileTypes: true })
    .filter((entry) => entry.isDirectory() && shouldRemoveDirectory(entry.name))
    .map((entry) => {
      const fullPath = path.join(tmpDir, entry.name);
      const stats = fs.statSync(fullPath);
      const sizeBytes = directorySizeBytes(fullPath);
      return {
        name: entry.name,
        path: fullPath,
        lastModifiedMs: stats.mtimeMs,
        sizeBytes,
        kind: "directory",
      };
    })
    .sort((a, b) => b.sizeBytes - a.sizeBytes);

  const fileTargets = fs
    .readdirSync(tmpDir, { withFileTypes: true })
    .filter((entry) => entry.isFile() && shouldRemoveFile(entry.name))
    .map((entry) => {
      const fullPath = path.join(tmpDir, entry.name);
      const stats = fs.statSync(fullPath);
      return {
        name: entry.name,
        path: fullPath,
        lastModifiedMs: stats.mtimeMs,
        sizeBytes: stats.size,
        kind: "file",
      };
    })
    .sort((a, b) => b.sizeBytes - a.sizeBytes);

  return [...directoryTargets, ...fileTargets].sort((a, b) => b.sizeBytes - a.sizeBytes);
}

function cleanupTmpRoot({ apply = false, tmpDir = TMP_DIR } = {}) {
  const targets = listCleanupTargets(tmpDir);
  if (apply) {
    for (const target of targets) {
      fs.rmSync(target.path, { recursive: target.kind === "directory", force: true });
    }
  }
  const reclaimedBytes = targets.reduce((acc, target) => acc + target.sizeBytes, 0);
  return {
    generated_at: new Date().toISOString(),
    tmp_dir: tmpDir,
    apply,
    removed_count: targets.length,
    removed_dir_count: targets.filter((target) => target.kind === "directory").length,
    removed_file_count: targets.filter((target) => target.kind === "file").length,
    reclaimed_bytes: reclaimedBytes,
    reclaimed_human: formatBytes(reclaimedBytes),
    removed: targets.map((target) => ({
      name: target.name,
      kind: target.kind,
      size_bytes: target.sizeBytes,
      size_human: formatBytes(target.sizeBytes),
      last_modified_at: new Date(target.lastModifiedMs).toISOString(),
    })),
  };
}

function main() {
  const apply = hasFlag("--apply");
  const summary = cleanupTmpRoot({ apply });
  console.log(JSON.stringify(summary, null, 2));
  if (!apply) {
    console.log("dry-run: pass --apply to delete removable tmp root directories");
  }
}

if (require.main === module) {
  main();
}

module.exports = {
  cleanupTmpRoot,
  listCleanupTargets,
  shouldRemoveDirectory,
  shouldRemoveFile,
};
