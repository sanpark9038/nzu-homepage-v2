const fs = require("fs");
const path = require("path");

const ROOT = path.resolve(__dirname, "..", "..");
const DEFAULT_REVIEW_PATH = path.join(
  ROOT,
  "data",
  "metadata",
  "soop_reference_review_decisions.v1.json"
);
const DEFAULT_NORMALIZED_PATH = path.join(
  ROOT,
  "tmp",
  "reports",
  "soop_reference_44.normalized.json"
);
const DEFAULT_OUTPUT_PATH = path.join(
  ROOT,
  "data",
  "metadata",
  "soop_reference_onboarding_candidates.v1.json"
);

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

function buildReferenceIndex(normalized) {
  const rows = Array.isArray(normalized.records) ? normalized.records : [];
  return new Map(
    rows.map((row) => {
      const key = `${trim(row.source_name)}::${trim(row.soop_user_id)}`;
      return [key, row];
    })
  );
}

function buildCandidate(row, referenceIndex) {
  const key = `${trim(row.source_name)}::${trim(row.incoming_soop_user_id)}`;
  const ref = referenceIndex.get(key) || null;
  const wrId = Number(row.elo_wr_id);
  const refProfileKind = trim(ref && ref.elo_ref && ref.elo_ref.profile_kind);

  return {
    wr_id: Number.isFinite(wrId) ? wrId : null,
    canonical_name: trim((ref && ref.source_name) || row.source_name) || null,
    display_name: trim((ref && ref.display_name) || row.source_name) || null,
    soop_user_id: trim(row.incoming_soop_user_id) || null,
    profile_kind: refProfileKind || trim(row.profile_kind || "") || "unknown",
    broadcast_url:
      trim((ref && ref.broadcast_url) || `https://www.sooplive.com/station/${trim(row.incoming_soop_user_id)}`) ||
      null,
    profile_image_url:
      trim((ref && ref.profile_image_url) || `https://profile.img.sooplive.com/LOGO/af/${trim(row.incoming_soop_user_id)}/${trim(row.incoming_soop_user_id)}.jpg`) ||
      null,
    race: trim(ref && ref.race) || null,
    college: trim(ref && ref.college) || null,
    source_reason: trim(row.reason) || null,
  };
}

function buildConflict(row) {
  return {
    wr_id: Number(row.wr_id),
    metadata_name: trim(row.metadata_name) || null,
    existing_soop_user_id: trim(row.existing_soop_user_id) || null,
    source_name: trim(row.source_name) || null,
    incoming_soop_user_id: trim(row.incoming_soop_user_id) || null,
    decision: trim(row.decision) || "keep_metadata",
    reason: trim(row.reason) || null,
  };
}

function main() {
  const reviewPath = path.resolve(argValue("--review", DEFAULT_REVIEW_PATH));
  const normalizedPath = path.resolve(argValue("--normalized", DEFAULT_NORMALIZED_PATH));
  const outputPath = path.resolve(argValue("--output", DEFAULT_OUTPUT_PATH));

  const review = readJson(reviewPath);
  const normalized = readJson(normalizedPath);
  const referenceIndex = buildReferenceIndex(normalized);

  const referenceRows = Array.isArray(review.reference_only_with_wr_id)
    ? review.reference_only_with_wr_id
    : [];
  const approve = [];
  const hold = [];

  for (const row of referenceRows) {
    const candidate = buildCandidate(row, referenceIndex);
    if (row.category === "approve") approve.push(candidate);
    else hold.push(candidate);
  }

  approve.sort((a, b) => Number(a.wr_id) - Number(b.wr_id));
  hold.sort((a, b) => Number(a.wr_id || 0) - Number(b.wr_id || 0) || String(a.canonical_name).localeCompare(String(b.canonical_name), "ko"));

  const output = {
    schema_version: "1.0.0",
    generated_at: new Date().toISOString(),
    source_review: reviewPath,
    source_normalized: normalizedPath,
    totals: {
      approve: approve.length,
      hold: hold.length,
      conflict_keep: Array.isArray(review.conflict_review) ? review.conflict_review.length : 0,
    },
    approve,
    hold,
    conflict_keep: Array.isArray(review.conflict_review) ? review.conflict_review.map(buildConflict) : [],
  };

  writeJson(outputPath, output);
  console.log("Generated SOOP reference onboarding candidates.");
  console.log(`- review: ${reviewPath}`);
  console.log(`- normalized: ${normalizedPath}`);
  console.log(`- output: ${outputPath}`);
  console.log(`- approve: ${approve.length}`);
  console.log(`- hold: ${hold.length}`);
  console.log(`- conflict_keep: ${output.totals.conflict_keep}`);
}

main();
