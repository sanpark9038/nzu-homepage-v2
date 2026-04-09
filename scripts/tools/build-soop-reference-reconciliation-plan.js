const fs = require("fs");
const path = require("path");

const ROOT = path.resolve(__dirname, "..", "..");
const REPORTS_DIR = path.join(ROOT, "tmp", "reports");

function argValue(flag, fallback = null) {
  const idx = process.argv.indexOf(flag);
  if (idx >= 0 && process.argv[idx + 1]) return process.argv[idx + 1];
  return fallback;
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

function indexRecordsByComposite(records) {
  const map = new Map();
  for (const row of Array.isArray(records) ? records : []) {
    const key = `${trim(row.source_name)}|${trim(row.display_name)}|${trim(row.incoming_soop_user_id)}`;
    map.set(key, row);
  }
  return map;
}

function main() {
  const diffPath = argValue("--diff");
  if (!diffPath) {
    throw new Error("Usage: node scripts/tools/build-soop-reference-reconciliation-plan.js --diff <diff-report> [--normalized <normalized-report>]");
  }

  const normalizedPath = argValue("--normalized", null);
  const diff = readJson(path.resolve(diffPath));
  const normalized = normalizedPath ? readJson(path.resolve(normalizedPath)) : null;
  const normalizedByComposite = normalized
    ? indexRecordsByComposite(
        (normalized.records || []).map((row) => ({
          source_name: row.source_name,
          display_name: row.display_name,
          incoming_soop_user_id: row.soop_user_id,
          normalized: row,
        }))
      )
    : new Map();

  const safeRows = [
    ...(Array.isArray(diff.safe_fill_by_wr_id) ? diff.safe_fill_by_wr_id : []),
    ...(Array.isArray(diff.safe_fill_by_name) ? diff.safe_fill_by_name : []),
  ];

  const safeMetadataUpdates = safeRows.map((row) => {
    const key = `${trim(row.source_name)}|${trim(row.display_name)}|${trim(row.incoming_soop_user_id)}`;
    const normalizedRow = normalizedByComposite.get(key);
    return {
      wr_id: Number(row.wr_id),
      metadata_name: trim(row.metadata_name) || null,
      metadata_gender: trim(row.metadata_gender) || null,
      soop_user_id: trim(row.incoming_soop_user_id) || null,
      source_name: trim(row.source_name) || null,
      display_name: trim(row.display_name) || null,
      profile_kind: trim(row.profile_kind) || null,
      broadcast_url: normalizedRow && normalizedRow.normalized
        ? trim(normalizedRow.normalized.broadcast_url) || null
        : null,
      profile_image_url: normalizedRow && normalizedRow.normalized
        ? trim(normalizedRow.normalized.profile_image_url) || null
        : null,
    };
  });

  const aliasSuggestions = [];
  if (normalized && Array.isArray(normalized.records)) {
    for (const row of normalized.records) {
      const sourceName = trim(row.source_name);
      const displayName = trim(row.display_name);
      if (!sourceName || !displayName || sourceName === displayName) continue;
      aliasSuggestions.push({
        canonical_name: sourceName,
        alias_name: displayName,
        soop_user_id: trim(row.soop_user_id) || null,
      });
    }
  }

  const plan = {
    generated_at: new Date().toISOString(),
    inputs: {
      diff_report: path.resolve(diffPath),
      normalized_report: normalizedPath ? path.resolve(normalizedPath) : null,
    },
    totals: {
      safe_metadata_updates: safeMetadataUpdates.length,
      alias_suggestions: aliasSuggestions.length,
      conflict_review: Array.isArray(diff.conflicts) ? diff.conflicts.length : 0,
      reference_only_with_wr_id: Array.isArray(diff.reference_only_with_wr_id)
        ? diff.reference_only_with_wr_id.length
        : 0,
      reference_only_without_wr_id: Array.isArray(diff.reference_only_without_wr_id)
        ? diff.reference_only_without_wr_id.length
        : 0,
    },
    safe_metadata_updates: safeMetadataUpdates,
    alias_suggestions: aliasSuggestions,
    conflict_review: diff.conflicts || [],
    reference_only_with_wr_id: diff.reference_only_with_wr_id || [],
    reference_only_without_wr_id: diff.reference_only_without_wr_id || [],
  };

  const outputPath =
    argValue("--output") ||
    path.join(REPORTS_DIR, `soop_reference_reconciliation_plan_${path.basename(diffPath, path.extname(diffPath))}.json`);
  writeJson(outputPath, plan);
  console.log(`Generated SOOP reconciliation plan.`);
  console.log(`- diff: ${path.resolve(diffPath)}`);
  console.log(`- output: ${outputPath}`);
  console.log(`- safe_metadata_updates: ${plan.totals.safe_metadata_updates}`);
  console.log(`- alias_suggestions: ${plan.totals.alias_suggestions}`);
  console.log(`- conflict_review: ${plan.totals.conflict_review}`);
  console.log(`- reference_only_with_wr_id: ${plan.totals.reference_only_with_wr_id}`);
}

main();
