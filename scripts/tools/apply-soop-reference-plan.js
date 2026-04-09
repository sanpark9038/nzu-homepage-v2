const fs = require("fs");
const path = require("path");

const ROOT = path.resolve(__dirname, "..", "..");
const PLAYER_METADATA_PATH = path.join(ROOT, "scripts", "player_metadata.json");
const DEFAULT_PLAN_PATH = path.join(
  ROOT,
  "tmp",
  "reports",
  "soop_reference_reconciliation_plan_soop_reference_diff_soop_reference_44.normalized.json"
);
const DEFAULT_REPORT_PATH = path.join(ROOT, "tmp", "reports", "soop_reference_apply_report.json");

function argValue(flag, fallback = null) {
  const idx = process.argv.indexOf(flag);
  if (idx >= 0 && process.argv[idx + 1]) return process.argv[idx + 1];
  return fallback;
}

function hasFlag(flag) {
  return process.argv.includes(flag);
}

function readJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, "utf8").replace(/^\uFEFF/, ""));
}

function writeJson(filePath, value) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, JSON.stringify(value, null, 2), "utf8");
}

function trim(value) {
  return String(value || "").trim();
}

function main() {
  const write = hasFlag("--write");
  const planPath = path.resolve(argValue("--plan", DEFAULT_PLAN_PATH));
  const reportPath = path.resolve(argValue("--report", DEFAULT_REPORT_PATH));

  const plan = readJson(planPath);
  const metadata = readJson(PLAYER_METADATA_PATH);
  if (!Array.isArray(metadata)) {
    throw new Error("scripts/player_metadata.json must be an array");
  }

  const byWrId = new Map(
    metadata.map((row) => [Number(row && row.wr_id), row]).filter(([wrId]) => Number.isFinite(wrId))
  );

  const applied = [];
  const skippedMissingRow = [];
  const skippedExisting = [];

  for (const update of Array.isArray(plan.safe_metadata_updates) ? plan.safe_metadata_updates : []) {
    const wrId = Number(update && update.wr_id);
    const incomingSoopId = trim(update && update.soop_user_id);
    if (!Number.isFinite(wrId) || !incomingSoopId) continue;

    const row = byWrId.get(wrId) || null;
    if (!row) {
      skippedMissingRow.push({
        wr_id: wrId,
        soop_user_id: incomingSoopId,
        reason: "metadata_row_not_found",
      });
      continue;
    }

    const existingSoopId = trim(row.soop_user_id);
    if (existingSoopId) {
      if (existingSoopId !== incomingSoopId) {
        skippedExisting.push({
          wr_id: wrId,
          metadata_name: trim(row.name) || null,
          existing_soop_user_id: existingSoopId,
          incoming_soop_user_id: incomingSoopId,
          reason: "existing_value_present",
        });
      }
      continue;
    }

    row.soop_user_id = incomingSoopId;
    applied.push({
      wr_id: wrId,
      metadata_name: trim(row.name) || null,
      metadata_gender: trim(row.gender) || null,
      soop_user_id: incomingSoopId,
      source_name: trim(update.source_name) || null,
      display_name: trim(update.display_name) || null,
      profile_kind: trim(update.profile_kind) || null,
    });
  }

  metadata.sort((a, b) => Number(a.wr_id) - Number(b.wr_id));

  const report = {
    generated_at: new Date().toISOString(),
    plan_path: planPath,
    player_metadata_path: PLAYER_METADATA_PATH,
    write,
    totals: {
      safe_metadata_updates_in_plan: Array.isArray(plan.safe_metadata_updates)
        ? plan.safe_metadata_updates.length
        : 0,
      applied: applied.length,
      skipped_missing_row: skippedMissingRow.length,
      skipped_existing: skippedExisting.length,
    },
    applied,
    skipped_missing_row: skippedMissingRow,
    skipped_existing: skippedExisting,
  };

  writeJson(reportPath, report);
  if (write) {
    writeJson(PLAYER_METADATA_PATH, metadata);
    console.log(`Applied SOOP reference plan to player metadata.`);
    console.log(`- updated: ${PLAYER_METADATA_PATH}`);
  } else {
    console.log(`Dry-run only. Use --write to apply.`);
  }
  console.log(`- report: ${reportPath}`);
  console.log(`- applied: ${applied.length}`);
  console.log(`- skipped_missing_row: ${skippedMissingRow.length}`);
  console.log(`- skipped_existing: ${skippedExisting.length}`);
}

main();
