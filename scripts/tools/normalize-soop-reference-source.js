const fs = require("fs");
const path = require("path");
const { loadReferenceFile } = require("./lib/soop-reference-source");

const ROOT = path.resolve(__dirname, "..", "..");
const REPORTS_DIR = path.join(ROOT, "tmp", "reports");

function argValue(flag, fallback = null) {
  const idx = process.argv.indexOf(flag);
  if (idx >= 0 && process.argv[idx + 1]) return process.argv[idx + 1];
  return fallback;
}

function writeJson(filePath, value) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, JSON.stringify(value, null, 2), "utf8");
}

function summarize(records) {
  const totals = {
    records: records.length,
    with_soop_user_id: 0,
    with_broadcast_url: 0,
    with_profile_image_url: 0,
    with_direct_elo_id: 0,
    with_custom_elo_url: 0,
    profile_kind_mix: 0,
    profile_kind_male: 0,
    profile_kind_female: 0,
    alias_rows: 0,
  };

  for (const row of records) {
    if (row.soop_user_id) totals.with_soop_user_id += 1;
    if (row.broadcast_url) totals.with_broadcast_url += 1;
    if (row.profile_image_url) totals.with_profile_image_url += 1;
    if (Number.isFinite(row.elo_ref?.direct_elo_id)) totals.with_direct_elo_id += 1;
    if (row.elo_ref?.custom_url) totals.with_custom_elo_url += 1;
    if (row.elo_ref?.profile_kind === "mix") totals.profile_kind_mix += 1;
    if (row.elo_ref?.profile_kind === "male") totals.profile_kind_male += 1;
    if (row.elo_ref?.profile_kind === "female") totals.profile_kind_female += 1;
    if (Array.isArray(row.alias_names) && row.alias_names.length > 0) totals.alias_rows += 1;
  }

  return totals;
}

function main() {
  const inputPath = argValue("--input");
  if (!inputPath) {
    throw new Error("Usage: node scripts/tools/normalize-soop-reference-source.js --input <path>");
  }

  const resolvedInput = path.resolve(inputPath);
  const { source, records } = loadReferenceFile(resolvedInput);
  const outputPath =
    argValue("--output") ||
    path.join(REPORTS_DIR, `soop_reference_${path.basename(resolvedInput, path.extname(resolvedInput))}.normalized.json`);

  const doc = {
    schema_version: "1.0.0",
    generated_at: new Date().toISOString(),
    source: {
      path: resolvedInput,
      kind: source.kind,
      label: source.label,
    },
    totals: summarize(records),
    records,
  };

  writeJson(outputPath, doc);
  console.log(`Normalized SOOP reference source.`);
  console.log(`- input: ${resolvedInput}`);
  console.log(`- source_kind: ${source.kind}`);
  console.log(`- records: ${records.length}`);
  console.log(`- output: ${outputPath}`);
}

main();
