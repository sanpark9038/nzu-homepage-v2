const fs = require("fs");
const path = require("path");

const ROOT = path.resolve(__dirname, "..", "..");
const TMP = path.join(ROOT, "tmp");

function ensureDir(p) {
  fs.mkdirSync(p, { recursive: true });
}

function readJsonIfExists(filePath) {
  if (!fs.existsSync(filePath)) return null;
  return JSON.parse(fs.readFileSync(filePath, "utf8").replace(/^\uFEFF/, ""));
}

function moveIfExists(src, dest) {
  if (!src || !fs.existsSync(src)) return false;
  if (path.resolve(src) === path.resolve(dest)) return true;
  ensureDir(path.dirname(dest));
  if (fs.existsSync(dest)) fs.unlinkSync(dest);
  try {
    fs.renameSync(src, dest);
  } catch (err) {
    const code = err && err.code ? String(err.code) : "";
    if (code !== "EBUSY" && code !== "EPERM") throw err;
    fs.copyFileSync(src, dest);
    try {
      fs.unlinkSync(src);
    } catch {
      // keep source if still locked; next run can retry cleanup
    }
  }
  return true;
}

function moveFromBatchReport(reportPath, teamCode, summary) {
  const report = readJsonIfExists(reportPath);
  if (!report || !Array.isArray(report.results)) return;
  const base = path.join(TMP, "exports", teamCode);
  const outJson = path.join(base, "json");
  const outCsv = path.join(base, "csv");
  ensureDir(outJson);
  ensureDir(outCsv);

  for (const row of report.results) {
    const jsonSrc = row.json_path ? path.resolve(ROOT, row.json_path) : null;
    const csvSrc = row.csv_path ? path.resolve(ROOT, row.csv_path) : null;
    if (jsonSrc && fs.existsSync(jsonSrc)) {
      const ok = moveIfExists(jsonSrc, path.join(outJson, path.basename(jsonSrc)));
      if (ok) summary.moved_json += 1;
    }
    if (csvSrc && fs.existsSync(csvSrc)) {
      const ok = moveIfExists(csvSrc, path.join(outCsv, path.basename(csvSrc)));
      if (ok) summary.moved_csv += 1;
    }
  }

  const reportDest = path.join(TMP, "reports", path.basename(reportPath));
  moveIfExists(reportPath, reportDest);
}

function moveKnownReports(summary) {
  const reportDir = path.join(TMP, "reports");
  ensureDir(reportDir);
  const patterns = [
    "metadata_db_build_report.json",
    "metadata_conflict_resolution_proposal.csv",
    "metadata_conflict_resolution_proposal.json",
    "metadata_gender_conflicts.csv",
    "metadata_gender_conflicts.json",
    "player_metadata_integrity_report.json",
    "player_metadata_canonical_preview.json",
    "warehouse_build_report.json",
    "warehouse_integrity_report.json",
    "nzu_10_validation_report.json",
    "nzu_10_validation_report.md",
  ];
  for (const name of patterns) {
    const src = path.join(TMP, name);
    const dest = path.join(reportDir, name);
    if (moveIfExists(src, dest)) summary.moved_reports += 1;
  }
}

function archiveDebugFiles(summary) {
  const dbgDir = path.join(TMP, "archive", "debug");
  ensureDir(dbgDir);
  const names = [
    "newcastle_dump.core.json",
    "newcastle_dump.tbody.html",
    "newcastle_dump.trimmed.tbody.html",
    "yb_male_wr28.html",
    "yb_male_wr45.html",
  ];
  for (const name of names) {
    const src = path.join(TMP, name);
    const dest = path.join(dbgDir, name);
    if (moveIfExists(src, dest)) summary.archived_debug += 1;
  }
}

function main() {
  ensureDir(TMP);
  const summary = {
    generated_at: new Date().toISOString(),
    moved_json: 0,
    moved_csv: 0,
    moved_reports: 0,
    archived_debug: 0,
  };

  const batchReports = fs
    .readdirSync(TMP)
    .filter((n) => /_roster_batch_export_report\.json$/i.test(n));
  for (const fileName of batchReports) {
    const m = fileName.match(/^([a-z0-9_-]+)_roster_batch_export_report\.json$/i);
    if (!m) continue;
    const teamCode = String(m[1]).toLowerCase();
    moveFromBatchReport(path.join(TMP, fileName), teamCode, summary);
  }
  moveKnownReports(summary);
  archiveDebugFiles(summary);

  const out = path.join(TMP, "reports", "artifact_organization_report.json");
  ensureDir(path.dirname(out));
  fs.writeFileSync(out, JSON.stringify(summary, null, 2), "utf8");
  console.log(JSON.stringify(summary, null, 2));
  console.log(`report: ${out}`);
}

main();
