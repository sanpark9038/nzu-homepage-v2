const fs = require("fs");
const path = require("path");

const ROOT = path.resolve(__dirname, "..", "..");
const DEFAULT_CANDIDATES_PATH = path.join(
  ROOT,
  "data",
  "metadata",
  "soop_reference_onboarding_candidates.v1.json"
);
const DEFAULT_DECISIONS_PATH = path.join(
  ROOT,
  "data",
  "metadata",
  "soop_manual_review_decisions.v1.json"
);
const DEFAULT_OUTPUT_PATH = path.join(
  ROOT,
  "tmp",
  "reports",
  "soop_manual_onboarding_plan.json"
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

function candidateKey(row) {
  return `${trim(row.canonical_name || row.source_name)}::${trim(row.display_name || row.source_name)}::${trim(row.soop_user_id)}`;
}

function decisionKey(row) {
  return `${trim(row.canonical_name || row.source_name)}::${trim(row.source_name)}::${trim(row.soop_user_id)}`;
}

function buildCandidateIndex(candidates) {
  const rows = [
    ...(Array.isArray(candidates.approve) ? candidates.approve : []),
    ...(Array.isArray(candidates.hold) ? candidates.hold : [])
  ];
  return {
    byComposite: new Map(rows.map((row) => [candidateKey(row), row])),
    bySoopId: new Map(rows.map((row) => [trim(row.soop_user_id), row]))
  };
}

function normalizeEntry(candidate, decision) {
  return {
    wr_id: candidate && Number.isFinite(Number(candidate.wr_id)) ? Number(candidate.wr_id) : null,
    source_name: trim(decision.source_name || (candidate && candidate.display_name) || (candidate && candidate.canonical_name)) || null,
    canonical_name: trim(decision.canonical_name || (candidate && candidate.canonical_name) || decision.source_name) || null,
    alias_names: Array.isArray(decision.alias_names) ? decision.alias_names.filter(Boolean) : [],
    soop_user_id: trim(decision.soop_user_id || (candidate && candidate.soop_user_id)) || null,
    broadcast_url: trim((candidate && candidate.broadcast_url) || `https://www.sooplive.com/station/${trim(decision.soop_user_id)}`) || null,
    profile_image_url: trim((candidate && candidate.profile_image_url) || `https://profile.img.sooplive.com/LOGO/af/${trim(decision.soop_user_id)}/${trim(decision.soop_user_id)}.jpg`) || null,
    race: trim(candidate && candidate.race) || null,
    college: trim(candidate && candidate.college) || null,
    profile_kind: trim(candidate && candidate.profile_kind) || "unknown",
    decision: trim(decision.decision) || "include",
    soop_requirement: trim(decision.soop_requirement) || "required",
    elo_requirement: trim(decision.elo_requirement) || "required",
    notes: trim(decision.notes) || null
  };
}

function main() {
  const candidatesPath = path.resolve(argValue("--candidates", DEFAULT_CANDIDATES_PATH));
  const decisionsPath = path.resolve(argValue("--decisions", DEFAULT_DECISIONS_PATH));
  const outputPath = path.resolve(argValue("--output", DEFAULT_OUTPUT_PATH));

  const candidates = readJson(candidatesPath);
  const decisionsDoc = readJson(decisionsPath);
  const decisionRows = Array.isArray(decisionsDoc.decisions) ? decisionsDoc.decisions : [];
  const candidateIndex = buildCandidateIndex(candidates);

  const includeWithElo = [];
  const includePendingElo = [];
  const includeSoopOnly = [];
  const exclude = [];
  const unresolved = [];

  for (const decision of decisionRows) {
    const key = decisionKey(decision);
    const candidate =
      candidateIndex.byComposite.get(key) ||
      candidateIndex.bySoopId.get(trim(decision.soop_user_id)) ||
      null;
    const entry = normalizeEntry(candidate, decision);

    if (entry.decision === "exclude") {
      exclude.push(entry);
      continue;
    }

    if (entry.elo_requirement === "pending_registration") {
      includePendingElo.push(entry);
      continue;
    }

    if (entry.elo_requirement === "not_required") {
      includeSoopOnly.push(entry);
      continue;
    }

    includeWithElo.push(entry);
  }

  const decidedKeys = new Set(decisionRows.map(decisionKey));
  const decidedSoopIds = new Set(decisionRows.map((row) => trim(row.soop_user_id)).filter(Boolean));
  for (const row of [...(candidates.approve || []), ...(candidates.hold || [])]) {
    const key = `${trim(row.canonical_name)}::${trim(row.display_name)}::${trim(row.soop_user_id)}`;
    const soopId = trim(row.soop_user_id);
    if (!decidedKeys.has(key) && !decidedSoopIds.has(soopId)) {
      unresolved.push({
        wr_id: Number.isFinite(Number(row.wr_id)) ? Number(row.wr_id) : null,
        canonical_name: trim(row.canonical_name) || null,
        display_name: trim(row.display_name) || null,
        soop_user_id: trim(row.soop_user_id) || null,
        source_reason: trim(row.source_reason) || null
      });
    }
  }

  const output = {
    schema_version: "1.0.0",
    generated_at: new Date().toISOString(),
    source_candidates: candidatesPath,
    source_decisions: decisionsPath,
    totals: {
      include_with_elo: includeWithElo.length,
      include_pending_elo: includePendingElo.length,
      include_soop_only: includeSoopOnly.length,
      exclude: exclude.length,
      unresolved: unresolved.length
    },
    include_with_elo: includeWithElo.sort((a, b) => String(a.canonical_name).localeCompare(String(b.canonical_name), "ko")),
    include_pending_elo: includePendingElo.sort((a, b) => String(a.canonical_name).localeCompare(String(b.canonical_name), "ko")),
    include_soop_only: includeSoopOnly.sort((a, b) => String(a.canonical_name).localeCompare(String(b.canonical_name), "ko")),
    exclude: exclude.sort((a, b) => String(a.canonical_name).localeCompare(String(b.canonical_name), "ko")),
    unresolved: unresolved.sort((a, b) => String(a.canonical_name).localeCompare(String(b.canonical_name), "ko"))
  };

  writeJson(outputPath, output);
  console.log("Generated SOOP manual onboarding plan.");
  console.log(`- candidates: ${candidatesPath}`);
  console.log(`- decisions: ${decisionsPath}`);
  console.log(`- output: ${outputPath}`);
  console.log(`- include_with_elo: ${output.totals.include_with_elo}`);
  console.log(`- include_pending_elo: ${output.totals.include_pending_elo}`);
  console.log(`- include_soop_only: ${output.totals.include_soop_only}`);
  console.log(`- exclude: ${output.totals.exclude}`);
  console.log(`- unresolved: ${output.totals.unresolved}`);
}

main();
