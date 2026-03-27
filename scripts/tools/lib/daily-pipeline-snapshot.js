const fs = require("fs");
const path = require("path");

function latestPreviousSnapshotPath(dateStr, reportsDir) {
  const currentDate = String(dateStr || "").trim().slice(0, 10);
  if (!fs.existsSync(reportsDir)) return null;
  const files = fs
    .readdirSync(reportsDir)
    .filter((n) => /^daily_pipeline_snapshot_\d{4}-\d{2}-\d{2}\.json$/.test(n))
    .filter((n) => !currentDate || !n.includes(currentDate))
    .sort();
  if (!files.length) return null;
  return path.join(reportsDir, files[files.length - 1]);
}

function parseDateTag(value) {
  const text = String(value || "").trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(text)) return null;
  const stamp = `${text}T00:00:00Z`;
  const ms = Date.parse(stamp);
  if (Number.isNaN(ms)) return null;
  return ms;
}

function isComparablePriorSnapshot(prior, from, to) {
  if (!prior || typeof prior !== "object") return false;
  if (String(prior.period_from || "") !== String(from)) return false;

  const priorTo = parseDateTag(prior.period_to);
  const currentTo = parseDateTag(to);
  if (priorTo === null || currentTo === null) return false;

  return priorTo < currentTo;
}

module.exports = {
  isComparablePriorSnapshot,
  latestPreviousSnapshotPath,
  parseDateTag,
};
