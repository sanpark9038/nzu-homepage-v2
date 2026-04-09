const fs = require("fs");
const path = require("path");

const ROOT = path.resolve(__dirname, "..", "..");
const PLAYER_METADATA_PATH = path.join(ROOT, "scripts", "player_metadata.json");
const MAPPINGS_PATH = path.join(ROOT, "data", "metadata", "soop_channel_mappings.v1.json");
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

function normalizeName(value) {
  return trim(value).toLowerCase();
}

function buildAliasMaps(mappingsDoc) {
  const aliases = mappingsDoc && typeof mappingsDoc.aliases === "object" ? mappingsDoc.aliases : {};
  const aliasToCanonical = new Map();
  const canonicalToAliases = new Map();
  for (const [aliasName, canonicalName] of Object.entries(aliases)) {
    const alias = trim(aliasName);
    const canonical = trim(canonicalName);
    if (!alias || !canonical) continue;
    aliasToCanonical.set(alias, canonical);
    const bucket = canonicalToAliases.get(canonical) || new Set();
    bucket.add(alias);
    canonicalToAliases.set(canonical, bucket);
  }
  return { aliasToCanonical, canonicalToAliases };
}

function buildMetadataIndexes(metadata) {
  const byWrId = new Map();
  const byName = new Map();
  const withSoop = [];
  for (const row of Array.isArray(metadata) ? metadata : []) {
    const wrId = Number(row && row.wr_id);
    const name = trim(row && row.name);
    if (Number.isFinite(wrId)) byWrId.set(wrId, row);
    if (name && !byName.has(name)) byName.set(name, row);
    if (trim(row && row.soop_user_id)) withSoop.push(row);
  }
  return { byWrId, byName, withSoop };
}

function buildReferenceIndexes(records) {
  const bySoopId = new Map();
  const byWrId = new Map();
  const byName = new Map();
  for (const row of Array.isArray(records) ? records : []) {
    const soopId = trim(row && row.soop_user_id).toLowerCase();
    const wrId = Number(row && row.elo_ref && row.elo_ref.wr_id);
    const sourceName = trim(row && row.source_name);
    const displayName = trim(row && row.display_name);
    if (soopId && !bySoopId.has(soopId)) bySoopId.set(soopId, row);
    if (Number.isFinite(wrId) && !byWrId.has(wrId)) byWrId.set(wrId, row);
    if (sourceName && !byName.has(sourceName)) byName.set(sourceName, row);
    if (displayName && !byName.has(displayName)) byName.set(displayName, row);
  }
  return { bySoopId, byWrId, byName };
}

function makePayload(target, row, matchKind) {
  return {
    match_kind: matchKind,
    wr_id: Number(target && target.wr_id),
    metadata_name: trim(target && target.name) || null,
    metadata_gender: trim(target && target.gender) || null,
    existing_soop_user_id: trim(target && target.soop_user_id) || null,
    source_name: trim(row && row.source_name) || null,
    display_name: trim(row && row.display_name) || null,
    incoming_soop_user_id: trim(row && row.soop_user_id) || null,
    profile_kind: row && row.elo_ref ? trim(row.elo_ref.profile_kind) || null : null,
    elo_wr_id:
      row && row.elo_ref && Number.isFinite(Number(row.elo_ref.wr_id))
        ? Number(row.elo_ref.wr_id)
        : null,
  };
}

function pickAliasTarget(row, aliasMaps, metadataIndexes) {
  const names = [
    trim(row && row.source_name),
    trim(row && row.display_name),
    ...((row && Array.isArray(row.alias_names) ? row.alias_names : []).map((value) => trim(value))),
  ].filter(Boolean);

  for (const name of names) {
    const canonical = aliasMaps.aliasToCanonical.get(name);
    if (!canonical) continue;
    const target = metadataIndexes.byName.get(canonical) || null;
    if (target) {
      return {
        target,
        alias_name: name,
        canonical_name: canonical,
      };
    }
  }
  return null;
}

function summarize(report) {
  return {
    records_total: report.records_total,
    already_aligned: report.already_aligned.length,
    safe_fill_by_wr_id: report.safe_fill_by_wr_id.length,
    safe_fill_by_name: report.safe_fill_by_name.length,
    alias_review: report.alias_review.length,
    conflicts: report.conflicts.length,
    reference_only_with_wr_id: report.reference_only_with_wr_id.length,
    reference_only_without_wr_id: report.reference_only_without_wr_id.length,
    metadata_only_with_soop: report.metadata_only_with_soop.length,
  };
}

function main() {
  const inputPath = argValue("--input");
  if (!inputPath) {
    throw new Error("Usage: node scripts/tools/report-soop-reference-diff.js --input <normalized-json>");
  }

  const normalizedDoc = readJson(path.resolve(inputPath));
  const metadata = readJson(PLAYER_METADATA_PATH);
  const mappingsDoc = readJson(MAPPINGS_PATH);

  const records = Array.isArray(normalizedDoc.records) ? normalizedDoc.records : [];
  const aliasMaps = buildAliasMaps(mappingsDoc);
  const metadataIndexes = buildMetadataIndexes(metadata);
  const referenceIndexes = buildReferenceIndexes(records);

  const report = {
    generated_at: new Date().toISOString(),
    input_path: path.resolve(inputPath),
    records_total: records.length,
    already_aligned: [],
    safe_fill_by_wr_id: [],
    safe_fill_by_name: [],
    alias_review: [],
    conflicts: [],
    reference_only_with_wr_id: [],
    reference_only_without_wr_id: [],
    metadata_only_with_soop: [],
  };

  const matchedMetadataKeys = new Set();

  for (const row of records) {
    const wrId = Number(row && row.elo_ref && row.elo_ref.wr_id);
    const sourceName = trim(row && row.source_name);
    const directWrTarget = Number.isFinite(wrId) ? metadataIndexes.byWrId.get(wrId) || null : null;
    const exactNameTarget = sourceName ? metadataIndexes.byName.get(sourceName) || null : null;
    const aliasTarget = pickAliasTarget(row, aliasMaps, metadataIndexes);

    const target = directWrTarget || exactNameTarget || (aliasTarget ? aliasTarget.target : null);
    if (!target) {
      const payload = {
        source_name: trim(row && row.source_name) || null,
        display_name: trim(row && row.display_name) || null,
        incoming_soop_user_id: trim(row && row.soop_user_id) || null,
        elo_wr_id: Number.isFinite(wrId) ? wrId : null,
        profile_kind: row && row.elo_ref ? trim(row.elo_ref.profile_kind) || null : null,
      };
      if (Number.isFinite(wrId)) report.reference_only_with_wr_id.push(payload);
      else report.reference_only_without_wr_id.push(payload);
      continue;
    }

    matchedMetadataKeys.add(`${Number(target.wr_id)}:${trim(target.name)}`);

    const existingSoopId = trim(target.soop_user_id);
    const incomingSoopId = trim(row && row.soop_user_id);
    const matchKind = directWrTarget
      ? "wr_id"
      : exactNameTarget
        ? "name"
        : "alias";

    if (existingSoopId && existingSoopId !== incomingSoopId) {
      const payload = makePayload(target, row, matchKind);
      if (aliasTarget) {
        payload.alias_name = aliasTarget.alias_name;
        payload.canonical_name = aliasTarget.canonical_name;
      }
      report.conflicts.push(payload);
      continue;
    }

    const payload = makePayload(target, row, matchKind);
    if (aliasTarget) {
      payload.alias_name = aliasTarget.alias_name;
      payload.canonical_name = aliasTarget.canonical_name;
    }

    if (existingSoopId && existingSoopId === incomingSoopId) {
      report.already_aligned.push(payload);
      continue;
    }

    if (matchKind === "wr_id") {
      report.safe_fill_by_wr_id.push(payload);
      continue;
    }
    if (matchKind === "name") {
      report.safe_fill_by_name.push(payload);
      continue;
    }
    report.alias_review.push(payload);
  }

  for (const row of metadataIndexes.withSoop) {
    const key = `${Number(row.wr_id)}:${trim(row.name)}`;
    if (matchedMetadataKeys.has(key)) continue;
    const wrId = Number(row.wr_id);
    const soopId = trim(row.soop_user_id).toLowerCase();
    const name = trim(row.name);
    if (
      (Number.isFinite(wrId) && referenceIndexes.byWrId.has(wrId)) ||
      (soopId && referenceIndexes.bySoopId.has(soopId)) ||
      (name && referenceIndexes.byName.has(name))
    ) {
      continue;
    }
    report.metadata_only_with_soop.push({
      wr_id: Number(row.wr_id),
      metadata_name: trim(row.name) || null,
      metadata_gender: trim(row.gender) || null,
      existing_soop_user_id: trim(row.soop_user_id) || null,
    });
  }

  report.totals = summarize(report);
  const outputPath =
    argValue("--output") ||
    path.join(REPORTS_DIR, `soop_reference_diff_${path.basename(inputPath, path.extname(inputPath))}.json`);
  writeJson(outputPath, report);
  console.log(`Generated SOOP reference diff report.`);
  console.log(`- input: ${path.resolve(inputPath)}`);
  console.log(`- output: ${outputPath}`);
  for (const [key, value] of Object.entries(report.totals)) {
    console.log(`- ${key}: ${value}`);
  }
}

main();
