const fs = require("fs");
const path = require("path");

const ROOT = path.resolve(__dirname, "..", "..");
const PROJECTS_DIR = path.join(ROOT, "data", "metadata", "projects");
const LEGACY_METADATA_PATH = path.join(
  ROOT,
  "scripts",
  "archive",
  "player-metadata-source-consolidation",
  "player_metadata.legacy_reference.v1.json"
);
const MASTER_METADATA_PATH = path.join(ROOT, "data", "metadata", "players.master.v1.json");
const COLLECTION_EXCLUSIONS_PATH = path.join(ROOT, "data", "metadata", "pipeline_collection_exclusions.v1.json");
const REPORT_PATH = path.join(ROOT, "tmp", "reports", "player_metadata_source_consolidation_latest.json");

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

function normalizeProjectPlayer(row, doc, project, filePath) {
  const name = trim(row && row.name);
  const teamCode = trim(row && row.team_code) || trim(doc && doc.team_code) || project;
  return {
    source: relativePath(filePath),
    project,
    entity_id: trim(row && row.entity_id),
    gender: trim(row && row.gender),
    wr_id: row && row.wr_id !== undefined ? row.wr_id : null,
    gender_wr_id: genderWrIdKey(row),
    name,
    display_name: trim(row && row.display_name) || name,
    team_code: teamCode,
    team_name: trim(row && row.team_name) || trim(doc && doc.team_name) || teamCode,
    tier: trim(row && row.tier),
    race: trim(row && row.race),
    soop_user_id: trim(row && row.soop_user_id),
  };
}

function normalizeMetadataRow(row, source) {
  const name = trim(row && row.name);
  return {
    source,
    entity_id: trim(row && row.entity_id),
    gender: trim(row && row.gender),
    wr_id: row && row.wr_id !== undefined ? row.wr_id : null,
    gender_wr_id: genderWrIdKey(row),
    name,
    display_name: trim(row && row.display_name) || name,
    team_code: trim(row && row.team_code),
    team_name: trim(row && row.team_name),
    tier: trim(row && row.tier),
    race: trim(row && row.race),
    soop_user_id: trim(row && row.soop_user_id),
  };
}

function loadProjectPlayers() {
  if (!fs.existsSync(PROJECTS_DIR)) return [];
  const players = [];
  for (const entry of fs.readdirSync(PROJECTS_DIR, { withFileTypes: true })) {
    if (!entry.isDirectory()) continue;
    const project = entry.name;
    const filePath = path.join(PROJECTS_DIR, project, `players.${project}.v1.json`);
    if (!fs.existsSync(filePath)) continue;
    const doc = readJson(filePath, {});
    const roster = Array.isArray(doc && doc.roster) ? doc.roster : [];
    for (const row of roster) {
      players.push(normalizeProjectPlayer(row, doc, project, filePath));
    }
  }
  return players;
}

function loadLegacyPlayers() {
  const rows = readJson(LEGACY_METADATA_PATH, []);
  if (!Array.isArray(rows)) return [];
  return rows.map((row) => normalizeMetadataRow(row, relativePath(LEGACY_METADATA_PATH)));
}

function loadMasterPlayers() {
  const doc = readJson(MASTER_METADATA_PATH, []);
  const rows = Array.isArray(doc) ? doc : Array.isArray(doc && doc.players) ? doc.players : [];
  return rows.map((row) => normalizeMetadataRow(row, relativePath(MASTER_METADATA_PATH)));
}

function loadExcludedEntityIds() {
  const doc = readJson(COLLECTION_EXCLUSIONS_PATH, {});
  const players = Array.isArray(doc && doc.players) ? doc.players : [];
  return new Set(
    players
      .map((row) => trim(row && row.entity_id))
      .filter(Boolean)
  );
}

function coverage(rows) {
  return {
    rows: rows.length,
    entity_id: rows.filter((row) => trim(row.entity_id)).length,
    gender_wr_id: rows.filter((row) => trim(row.gender_wr_id)).length,
    team_code: rows.filter((row) => trim(row.team_code)).length,
    tier: rows.filter((row) => trim(row.tier)).length,
    soop_user_id: rows.filter((row) => trim(row.soop_user_id)).length,
  };
}

function indexByGenderWr(rows) {
  const map = new Map();
  for (const row of rows) {
    if (!row.gender_wr_id) continue;
    const bucket = map.get(row.gender_wr_id) || [];
    bucket.push(row);
    map.set(row.gender_wr_id, bucket);
  }
  return map;
}

function indexSoopIdsByGenderWr(rows) {
  const map = new Map();
  for (const row of rows) {
    const soopId = trim(row.soop_user_id).toLowerCase();
    if (!soopId || !row.gender_wr_id) continue;
    const bucket = map.get(soopId) || new Set();
    bucket.add(row.gender_wr_id);
    map.set(soopId, bucket);
  }
  return map;
}

function legacy_name_matches_project(projectRow, legacyRow) {
  const legacyName = trim(legacyRow && legacyRow.name);
  if (!legacyName) return false;
  return legacyName === trim(projectRow && projectRow.name) || legacyName === trim(projectRow && projectRow.display_name);
}

function duplicateKeys(rows) {
  return [...indexByGenderWr(rows).entries()]
    .filter(([, bucket]) => bucket.length > 1)
    .map(([key, bucket]) => ({
      gender_wr_id: key,
      rows: bucket.map((row) => ({
        source: row.source,
        entity_id: row.entity_id || null,
        name: row.name || null,
        display_name: row.display_name || null,
        team_code: row.team_code || null,
        soop_user_id: row.soop_user_id || null,
      })),
    }));
}

function soopCollisionRisks(rows) {
  const bySoop = new Map();
  for (const row of rows) {
    const soopId = trim(row.soop_user_id).toLowerCase();
    if (!soopId) continue;
    const bucket = bySoop.get(soopId) || [];
    bucket.push(row);
    bySoop.set(soopId, bucket);
  }
  return [...bySoop.entries()]
    .filter(([, bucket]) => new Set(bucket.map((row) => row.gender_wr_id || `${row.gender}:${row.wr_id}`)).size > 1)
    .map(([soopId, bucket]) => ({
      soop_user_id: soopId,
      rows: bucket.map((row) => ({
        source: row.source,
        gender_wr_id: row.gender_wr_id || null,
        name: row.name || null,
        display_name: row.display_name || null,
        team_code: row.team_code || null,
      })),
    }));
}

function buildSoopMigration(projectRows, legacyRows, excludedEntityIds = new Set()) {
  const projectDuplicateKeys = new Set(duplicateKeys(projectRows).map((row) => row.gender_wr_id));
  const legacyDuplicateKeys = new Set(duplicateKeys(legacyRows).map((row) => row.gender_wr_id));
  const legacyByKey = indexByGenderWr(legacyRows);
  const legacySoopIdsByGenderWr = indexSoopIdsByGenderWr(legacyRows);
  const safe = [];
  const manual = [];
  const excluded = [];

  for (const projectRow of projectRows) {
    if (projectRow.soop_user_id) continue;
    if (excludedEntityIds.has(projectRow.entity_id)) {
      excluded.push({
        match_key: projectRow.gender_wr_id ? "gender_wr_id" : null,
        gender_wr_id: projectRow.gender_wr_id || null,
        project: projectRow.project,
        project_source: projectRow.source,
        entity_id: projectRow.entity_id || null,
        name: projectRow.name || null,
        display_name: projectRow.display_name || null,
        team_code: projectRow.team_code || null,
        reason: "pipeline_collection_excluded",
      });
      continue;
    }

    const reason = [];
    if (!projectRow.gender_wr_id) reason.push("project_missing_gender_wr_id");
    if (projectDuplicateKeys.has(projectRow.gender_wr_id)) reason.push("project_duplicate_gender_wr_id");
    if (legacyDuplicateKeys.has(projectRow.gender_wr_id)) reason.push("legacy_duplicate_gender_wr_id");

    const legacyBucket = projectRow.gender_wr_id ? legacyByKey.get(projectRow.gender_wr_id) || [] : [];
    const legacyWithSoop = legacyBucket.filter((row) => row.soop_user_id);

    if (legacyWithSoop.length === 1) {
      const legacyRow = legacyWithSoop[0];
      if (!legacy_name_matches_project(projectRow, legacyRow)) {
        reason.push("legacy_name_mismatch");
      }
      if ((legacySoopIdsByGenderWr.get(trim(legacyRow.soop_user_id).toLowerCase()) || new Set()).size > 1) {
        reason.push("legacy_soop_id_collision");
      }
    }

    if (legacyWithSoop.length === 1 && reason.length === 0) {
      const legacyRow = legacyWithSoop[0];
      safe.push({
        match_key: "gender_wr_id",
        gender_wr_id: projectRow.gender_wr_id,
        project: projectRow.project,
        project_source: projectRow.source,
        entity_id: projectRow.entity_id || null,
        name: projectRow.name || null,
        display_name: projectRow.display_name || null,
        team_code: projectRow.team_code || null,
        legacy_source: legacyRow.source,
        legacy_name: legacyRow.name || null,
        legacy_soop_user_id: legacyRow.soop_user_id,
      });
      continue;
    }

    if (legacyBucket.length === 0) reason.push("legacy_match_missing");
    if (legacyBucket.length > 0 && legacyWithSoop.length === 0) reason.push("legacy_soop_id_missing");
    if (legacyWithSoop.length > 1) reason.push("multiple_legacy_soop_ids");

    manual.push({
      match_key: projectRow.gender_wr_id ? "gender_wr_id" : null,
      gender_wr_id: projectRow.gender_wr_id || null,
      project: projectRow.project,
      project_source: projectRow.source,
      entity_id: projectRow.entity_id || null,
      name: projectRow.name || null,
      display_name: projectRow.display_name || null,
      team_code: projectRow.team_code || null,
      reasons: [...new Set(reason)],
      legacy_candidates: legacyBucket.map((row) => ({
        source: row.source,
        name: row.name || null,
        display_name: row.display_name || null,
        team_code: row.team_code || null,
        soop_user_id: row.soop_user_id || null,
      })),
    });
  }

  return {
    safe_soop_id_migration_candidates: safe,
    manual_review_soop_id_candidates: manual,
    excluded_soop_id_candidates: excluded,
  };
}

function listFilesRecursive(dirPath) {
  if (!fs.existsSync(dirPath)) return [];
  const ignored = new Set([".git", "node_modules", ".next"]);
  const entries = fs.readdirSync(dirPath, { withFileTypes: true });
  return entries.flatMap((entry) => {
    if (ignored.has(entry.name)) return [];
    const fullPath = path.join(dirPath, entry.name);
    if (entry.isDirectory()) return listFilesRecursive(fullPath);
    return [fullPath];
  });
}

function legacyDependencyPaths() {
  const candidates = listFilesRecursive(ROOT).filter((filePath) => {
    const relative = relativePath(filePath);
    if (relative.startsWith("tmp/")) return false;
    if (relative.startsWith("scripts/archive/")) return false;
    if (relative === "scripts/player_metadata.json") return false;
    if (relative === "scripts/tools/report-player-metadata-source-consolidation.js") return false;
    if (relative === "scripts/tools/player-metadata-source-consolidation.test.js") return false;
    if (relative.endsWith(".md")) return false;
    return /\.(js|cjs|mjs|ts|tsx|json|md|yml|yaml)$/.test(relative);
  });
  const hits = [];
  for (const filePath of candidates) {
    const text = fs.readFileSync(filePath, "utf8");
    if (text.includes("scripts/player_metadata.json") || text.includes("player_metadata.json")) {
      hits.push(relativePath(filePath));
    }
  }
  return hits.sort();
}

function buildReport() {
  const projectRows = loadProjectPlayers();
  const legacyRows = loadLegacyPlayers();
  const masterRows = loadMasterPlayers();
  const excludedEntityIds = loadExcludedEntityIds();
  const migration = buildSoopMigration(projectRows, legacyRows, excludedEntityIds);

  return {
    generated_at: new Date().toISOString(),
    recommended_source_of_truth: "data/metadata/projects/*/players.*.v1.json",
    legacy_trust_level: "unverified_reference_only",
    recommendation_reason:
      "Project metadata carries current roster/team structure and stable player identifiers. Legacy metadata is unverified reference data and must not become a source of truth.",
    source_paths: {
      project_metadata: relativePath(PROJECTS_DIR),
      legacy_metadata: relativePath(LEGACY_METADATA_PATH),
      master_metadata: relativePath(MASTER_METADATA_PATH),
    },
    coverage: {
      project_metadata: coverage(projectRows),
      legacy_metadata: coverage(legacyRows),
      master_metadata: coverage(masterRows),
    },
    duplicate_gender_wr_id_keys: {
      project_metadata: duplicateKeys(projectRows),
      legacy_metadata: duplicateKeys(legacyRows),
      master_metadata: duplicateKeys(masterRows),
    },
    soop_id_collision_risks: {
      project_and_legacy: soopCollisionRisks(projectRows.concat(legacyRows)),
      legacy_metadata: soopCollisionRisks(legacyRows),
    },
    safe_soop_id_migration_candidates: migration.safe_soop_id_migration_candidates,
    manual_review_soop_id_candidates: migration.manual_review_soop_id_candidates,
    excluded_soop_id_candidates: migration.excluded_soop_id_candidates,
    legacy_dependency_paths: legacyDependencyPaths(),
  };
}

function main() {
  const report = buildReport();
  writeJson(REPORT_PATH, report);
  console.log("Wrote player metadata source consolidation report.");
  console.log(`- report: ${relativePath(REPORT_PATH)}`);
  console.log(`- recommended_source_of_truth: ${report.recommended_source_of_truth}`);
  console.log(`- project_rows: ${report.coverage.project_metadata.rows}`);
  console.log(`- legacy_rows: ${report.coverage.legacy_metadata.rows}`);
  console.log(`- safe_soop_id_migration_candidates: ${report.safe_soop_id_migration_candidates.length}`);
  console.log(`- manual_review_soop_id_candidates: ${report.manual_review_soop_id_candidates.length}`);
  console.log(`- excluded_soop_id_candidates: ${report.excluded_soop_id_candidates.length}`);
  console.log(`- legacy_dependency_paths: ${report.legacy_dependency_paths.length}`);
}

if (require.main === module) {
  main();
}

module.exports = {
  buildReport,
  genderWrIdKey,
};
