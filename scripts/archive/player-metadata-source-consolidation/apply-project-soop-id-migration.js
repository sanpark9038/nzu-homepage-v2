const fs = require("fs");
const path = require("path");

const ROOT = path.resolve(__dirname, "..", "..");
const PROJECTS_DIR = path.join(ROOT, "data", "metadata", "projects");
const CONSOLIDATION_REPORT_PATH = path.join(ROOT, "tmp", "reports", "player_metadata_source_consolidation_latest.json");
const MIGRATION_REPORT_PATH = path.join(ROOT, "tmp", "reports", "project_soop_id_migration_report.json");

function readJson(filePath, fallback) {
  if (!fs.existsSync(filePath)) return fallback;
  return JSON.parse(fs.readFileSync(filePath, "utf8").replace(/^\uFEFF/, ""));
}

function writeJson(filePath, value) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, JSON.stringify(value, null, 2), "utf8");
}

function trim(value) {
  return String(value || "").trim();
}

function relativePath(filePath) {
  return path.relative(ROOT, filePath).replace(/\\/g, "/");
}

function genderWrIdKey(row) {
  const gender = trim(row && row.gender);
  const wrId = trim(row && row.wr_id);
  if (!gender || !wrId) return "";
  return `${gender}:${wrId}`;
}

function parseArgs(argv) {
  const projectArg = argv.find((arg) => arg.startsWith("--project="));
  const projectFilter = projectArg ? trim(projectArg.slice("--project=".length)) : "";
  return {
    write: argv.includes("--write"),
    projectFilter,
  };
}

function loadMigrationCandidates() {
  const report = readJson(CONSOLIDATION_REPORT_PATH, null);
  if (!report) {
    throw new Error(
      `Missing ${relativePath(CONSOLIDATION_REPORT_PATH)}. Run npm run report:metadata:source-consolidation first.`
    );
  }
  const rows = Array.isArray(report.safe_soop_id_migration_candidates)
    ? report.safe_soop_id_migration_candidates
    : [];
  return rows.filter((row) => row && row.match_key === "gender_wr_id" && trim(row.gender_wr_id) && trim(row.legacy_soop_user_id));
}

function groupCandidatesByProject(candidates) {
  const grouped = new Map();
  for (const candidate of candidates) {
    const project = trim(candidate.project);
    if (!project) continue;
    const bucket = grouped.get(project) || [];
    bucket.push(candidate);
    grouped.set(project, bucket);
  }
  return grouped;
}

function migrateProject(project, candidates, write) {
  const filePath = path.join(PROJECTS_DIR, project, `players.${project}.v1.json`);
  const doc = readJson(filePath, null);
  if (!doc || !Array.isArray(doc.roster)) {
    return {
      project,
      source: relativePath(filePath),
      updated: 0,
      skipped: candidates.length,
      skips: candidates.map((candidate) => ({
        gender_wr_id: candidate.gender_wr_id,
        reason: "project_roster_missing",
      })),
    };
  }

  const candidateByKey = new Map(candidates.map((candidate) => [candidate.gender_wr_id, candidate]));
  const applied = [];
  const skips = [];

  for (const player of doc.roster) {
    const gender_wr_id = genderWrIdKey(player);
    const candidate = candidateByKey.get(gender_wr_id);
    if (!candidate) continue;

    if (trim(player.soop_user_id)) {
      skips.push({
        gender_wr_id,
        entity_id: trim(player.entity_id) || null,
        reason: "project_soop_user_id_already_present",
        existing_soop_user_id: trim(player.soop_user_id),
      });
      continue;
    }

    player.soop_user_id = trim(candidate.legacy_soop_user_id);
    applied.push({
      gender_wr_id,
      entity_id: trim(player.entity_id) || null,
      name: trim(player.name) || null,
      display_name: trim(player.display_name) || null,
      soop_user_id: player.soop_user_id,
    });
  }

  if (write && applied.length > 0) {
    writeJson(filePath, doc);
  }

  return {
    project,
    source: relativePath(filePath),
    updated: applied.length,
    skipped: skips.length,
    applied,
    skips,
  };
}

function main() {
  const { write, projectFilter } = parseArgs(process.argv.slice(2));
  const allCandidates = loadMigrationCandidates();
  const candidates = projectFilter
    ? allCandidates.filter((candidate) => candidate.project === projectFilter)
    : allCandidates;
  const grouped = groupCandidatesByProject(candidates);
  const projects = [...grouped.keys()].sort();
  const projectResults = projects.map((project) => migrateProject(project, grouped.get(project), write));
  const updated = projectResults.reduce((sum, result) => sum + result.updated, 0);
  const skipped = projectResults.reduce((sum, result) => sum + result.skipped, 0);
  const report = {
    generated_at: new Date().toISOString(),
    mode: write ? "write" : "dry-run",
    project_filter: projectFilter || null,
    source_report: relativePath(CONSOLIDATION_REPORT_PATH),
    candidate_count: candidates.length,
    total_available_candidate_count: allCandidates.length,
    updated,
    skipped,
    project_results: projectResults,
  };

  writeJson(MIGRATION_REPORT_PATH, report);

  if (write) {
    console.log("Applied project SOOP ID migration.");
  } else {
    console.log("Dry-run only. Use --write to update project metadata.");
  }
  console.log(`- report: ${relativePath(MIGRATION_REPORT_PATH)}`);
  console.log(`- project_filter: ${projectFilter || "all"}`);
  console.log(`- candidate_count: ${candidates.length}`);
  console.log(`- updated: ${updated}`);
  console.log(`- skipped: ${skipped}`);
}

if (require.main === module) {
  main();
}

module.exports = {
  genderWrIdKey,
  parseArgs,
};
