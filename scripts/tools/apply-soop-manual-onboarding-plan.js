const fs = require("fs");
const path = require("path");

const ROOT = path.resolve(__dirname, "..", "..");
const PLAYER_METADATA_PATH = path.join(ROOT, "scripts", "player_metadata.json");
const DEFAULT_PLAN_PATH = path.join(ROOT, "tmp", "reports", "soop_manual_onboarding_plan.json");
const DEFAULT_REPORT_PATH = path.join(ROOT, "tmp", "reports", "soop_manual_onboarding_apply_report.json");

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

function inferGender(profileKind) {
  if (profileKind === "male" || profileKind === "mix") return "male";
  if (profileKind === "female") return "female";
  return null;
}

function compareRows(a, b) {
  if (Number(a.wr_id) !== Number(b.wr_id)) return Number(a.wr_id) - Number(b.wr_id);
  if (String(a.gender) !== String(b.gender)) return String(a.gender).localeCompare(String(b.gender), "ko");
  return String(a.name).localeCompare(String(b.name), "ko");
}

function dedupeCandidates(items) {
  const seen = new Set();
  const unique = [];
  const skippedDuplicates = [];

  for (const item of items) {
    const wrId = Number(item && item.wr_id);
    const gender = inferGender(item && item.profile_kind);
    const canonicalName = trim(item && item.canonical_name);
    const soopUserId = trim(item && item.soop_user_id);
    if (!Number.isInteger(wrId) || wrId <= 0 || !gender || !canonicalName || !soopUserId) {
      continue;
    }

    const key = `${wrId}:${gender}`;
    if (seen.has(key)) {
      skippedDuplicates.push({
        wr_id: wrId,
        gender,
        canonical_name: canonicalName,
        source_name: trim(item && item.source_name) || null,
        soop_user_id: soopUserId,
        reason: "duplicate_wr_id_gender_in_plan",
      });
      continue;
    }

    seen.add(key);
    unique.push(item);
  }

  return { unique, skippedDuplicates };
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

  const includeWithElo = Array.isArray(plan.include_with_elo) ? plan.include_with_elo : [];
  const pendingElo = Array.isArray(plan.include_pending_elo) ? plan.include_pending_elo : [];
  const soopOnly = Array.isArray(plan.include_soop_only) ? plan.include_soop_only : [];

  const { unique: candidates, skippedDuplicates } = dedupeCandidates(includeWithElo);
  const byWrGender = new Map(metadata.map((row) => [`${row.wr_id}:${row.gender}`, row]));

  const added = [];
  const updated = [];
  const alreadyAligned = [];
  const conflicts = [];

  for (const candidate of candidates) {
    const wrId = Number(candidate.wr_id);
    const gender = inferGender(candidate.profile_kind);
    const canonicalName = trim(candidate.canonical_name);
    const sourceName = trim(candidate.source_name);
    const soopUserId = trim(candidate.soop_user_id);
    const key = `${wrId}:${gender}`;
    const existing = byWrGender.get(key) || null;

    if (!existing) {
      const row = {
        wr_id: wrId,
        name: canonicalName,
        gender,
        soop_user_id: soopUserId,
      };
      metadata.push(row);
      byWrGender.set(key, row);
      added.push({
        wr_id: wrId,
        gender,
        canonical_name: canonicalName,
        source_name: sourceName || null,
        soop_user_id: soopUserId,
      });
      continue;
    }

    const existingSoopId = trim(existing.soop_user_id);
    if (!existingSoopId) {
      existing.soop_user_id = soopUserId;
      updated.push({
        wr_id: wrId,
        gender,
        canonical_name: canonicalName,
        existing_name: trim(existing.name) || null,
        soop_user_id: soopUserId,
        reason: "filled_missing_soop_user_id",
      });
      continue;
    }

    if (existingSoopId === soopUserId) {
      alreadyAligned.push({
        wr_id: wrId,
        gender,
        canonical_name: canonicalName,
        existing_name: trim(existing.name) || null,
        soop_user_id: soopUserId,
      });
      continue;
    }

    conflicts.push({
      wr_id: wrId,
      gender,
      canonical_name: canonicalName,
      existing_name: trim(existing.name) || null,
      existing_soop_user_id: existingSoopId,
      incoming_soop_user_id: soopUserId,
      source_name: sourceName || null,
      reason: "existing_soop_user_id_conflict",
    });
  }

  metadata.sort(compareRows);

  const report = {
    generated_at: new Date().toISOString(),
    plan_path: planPath,
    player_metadata_path: PLAYER_METADATA_PATH,
    write,
    totals: {
      include_with_elo_in_plan: includeWithElo.length,
      deduped_positive_wr_id_candidates: candidates.length,
      added: added.length,
      updated: updated.length,
      already_aligned: alreadyAligned.length,
      conflicts: conflicts.length,
      skipped_duplicate_candidates: skippedDuplicates.length,
      pending_elo_kept_external: pendingElo.length,
      soop_only_kept_external: soopOnly.length,
    },
    added,
    updated,
    already_aligned: alreadyAligned,
    conflicts,
    skipped_duplicate_candidates: skippedDuplicates,
    pending_elo_kept_external: pendingElo.map((item) => ({
      source_name: trim(item && item.source_name) || null,
      canonical_name: trim(item && item.canonical_name) || null,
      soop_user_id: trim(item && item.soop_user_id) || null,
      notes: trim(item && item.notes) || null,
    })),
    soop_only_kept_external: soopOnly.map((item) => ({
      source_name: trim(item && item.source_name) || null,
      canonical_name: trim(item && item.canonical_name) || null,
      soop_user_id: trim(item && item.soop_user_id) || null,
      notes: trim(item && item.notes) || null,
    })),
  };

  writeJson(reportPath, report);
  if (write) {
    writeJson(PLAYER_METADATA_PATH, metadata);
    console.log("Applied SOOP manual onboarding plan to player metadata.");
    console.log(`- updated: ${PLAYER_METADATA_PATH}`);
  } else {
    console.log("Dry-run only. Use --write to apply.");
  }

  console.log(`- report: ${reportPath}`);
  console.log(`- added: ${added.length}`);
  console.log(`- updated: ${updated.length}`);
  console.log(`- already_aligned: ${alreadyAligned.length}`);
  console.log(`- conflicts: ${conflicts.length}`);
  console.log(`- pending_elo_kept_external: ${pendingElo.length}`);
  console.log(`- soop_only_kept_external: ${soopOnly.length}`);
}

main();
