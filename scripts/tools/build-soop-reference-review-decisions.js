const fs = require("fs");
const path = require("path");

const ROOT = path.resolve(__dirname, "..", "..");
const DEFAULT_PLAN_PATH = path.join(
  ROOT,
  "tmp",
  "reports",
  "soop_reference_reconciliation_plan_soop_reference_diff_soop_reference_44.normalized.json"
);
const DEFAULT_OUTPUT_PATH = path.join(
  ROOT,
  "data",
  "metadata",
  "soop_reference_review_decisions.v1.json"
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

function decideReferenceCandidate(row) {
  const wrId = Number(row && row.elo_wr_id);
  const profileKind = trim(row && row.profile_kind).toLowerCase();
  const sourceName = trim(row && row.source_name);

  if (Number.isFinite(wrId) && wrId > 0 && ["male", "female", "mix"].includes(profileKind)) {
    return {
      elo_wr_id: wrId,
      source_name: sourceName || null,
      incoming_soop_user_id: trim(row && row.incoming_soop_user_id) || null,
      category: "approve",
      reason:
        profileKind === "mix"
          ? "wr_id and mix profile are explicit in source"
          : "wr_id and profile kind are explicit in source",
    };
  }

  return {
    elo_wr_id: Number.isFinite(wrId) ? wrId : null,
    source_name: sourceName || null,
    incoming_soop_user_id: trim(row && row.incoming_soop_user_id) || null,
    category: "hold",
    reason:
      wrId > 0
        ? "profile kind is not explicit enough for automatic onboarding"
        : "wr_id is missing or zero, so onboarding stays manual",
  };
}

function decideConflict(row) {
  return {
    wr_id: Number(row && row.wr_id),
    metadata_name: trim(row && row.metadata_name) || null,
    existing_soop_user_id: trim(row && row.existing_soop_user_id) || null,
    source_name: trim(row && row.source_name) || null,
    incoming_soop_user_id: trim(row && row.incoming_soop_user_id) || null,
    decision: "keep_metadata",
    reason: "existing metadata already has a conflicting soop_user_id",
  };
}

function main() {
  const planPath = path.resolve(argValue("--plan", DEFAULT_PLAN_PATH));
  const outputPath = path.resolve(argValue("--output", DEFAULT_OUTPUT_PATH));
  const plan = readJson(planPath);

  const referenceOnly = Array.isArray(plan.reference_only_with_wr_id)
    ? plan.reference_only_with_wr_id
    : [];
  const conflicts = Array.isArray(plan.conflict_review) ? plan.conflict_review : [];

  const decisions = {
    schema_version: "1.0.0",
    generated_at: new Date().toISOString(),
    source_plan: planPath,
    policy: {
      reference_only_with_wr_id:
        "approve only when wr_id > 0 and profile_kind is male/female/mix; otherwise hold",
      conflict_review: "keep existing metadata on all soop_user_id conflicts",
    },
    totals: {
      reference_only_with_wr_id: referenceOnly.length,
      approve: 0,
      hold: 0,
      conflict_review: conflicts.length,
    },
    reference_only_with_wr_id: referenceOnly.map(decideReferenceCandidate),
    conflict_review: conflicts.map(decideConflict),
  };

  for (const row of decisions.reference_only_with_wr_id) {
    if (row.category === "approve") decisions.totals.approve += 1;
    else if (row.category === "hold") decisions.totals.hold += 1;
  }

  writeJson(outputPath, decisions);
  console.log("Generated SOOP reference review decisions.");
  console.log(`- plan: ${planPath}`);
  console.log(`- output: ${outputPath}`);
  console.log(`- approve: ${decisions.totals.approve}`);
  console.log(`- hold: ${decisions.totals.hold}`);
  console.log(`- conflict_review: ${decisions.totals.conflict_review}`);
}

main();
