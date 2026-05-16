const fs = require("fs");
const path = require("path");

const ROOT = path.join(__dirname, "..", "..");
const DEFAULT_ARTIFACT_DIR = path.join(ROOT, "tmp", "player-history-artifacts");
const REPORTS_DIR = path.join(ROOT, "tmp", "reports");
const DEFAULT_JSON_REPORT = path.join(REPORTS_DIR, "player_history_opponent_identity_coverage_latest.json");
const DEFAULT_MD_REPORT = path.join(REPORTS_DIR, "player_history_opponent_identity_coverage_latest.md");
const DEFAULT_PROJECTS_DIR = path.join(ROOT, "data", "metadata", "projects");

function argValue(argv, flag, fallback = null) {
  const index = argv.indexOf(flag);
  if (index >= 0 && argv[index + 1]) return argv[index + 1];
  return fallback;
}

function readJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, "utf8").replace(/^\uFEFF/, ""));
}

function listArtifactFiles(artifactDir) {
  if (!fs.existsSync(artifactDir)) return [];
  return fs
    .readdirSync(artifactDir)
    .filter((file) => file.endsWith(".json") && file !== "index.json")
    .sort()
    .map((file) => path.join(artifactDir, file));
}

function percent(numerator, denominator) {
  if (!denominator) return 0;
  return Number(((numerator / denominator) * 100).toFixed(2));
}

function normalizeIdentityLookupName(value) {
  return String(value || "")
    .trim()
    .toLowerCase()
    .replace(/\s+/g, "");
}

function loadOpponentCandidateIndex(projectsDir = DEFAULT_PROJECTS_DIR) {
  const byLookupName = new Map();
  if (!fs.existsSync(projectsDir)) return byLookupName;

  const projectDirs = fs
    .readdirSync(projectsDir, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => entry.name)
    .sort();

  for (const code of projectDirs) {
    const rosterPath = path.join(projectsDir, code, `players.${code}.v1.json`);
    if (!fs.existsSync(rosterPath)) continue;
    const doc = readJson(rosterPath);
    const roster = Array.isArray(doc.roster) ? doc.roster : [];
    for (const row of roster) {
      const entityId = String(row.entity_id || "").trim();
      const name = String(row.name || "").trim();
      if (!entityId || !name) continue;
      for (const candidateName of [name, row.display_name]) {
        const lookupName = normalizeIdentityLookupName(candidateName);
        if (!lookupName) continue;
        const bucket = byLookupName.get(lookupName) || new Map();
        bucket.set(entityId, {
          entity_id: entityId,
          name,
          display_name: String(row.display_name || "").trim(),
          team_code: String(row.team_code || code || "").trim(),
        });
        byLookupName.set(lookupName, bucket);
      }
    }
  }

  return byLookupName;
}

function classifyOpponentName(opponentName, candidateIndex) {
  const lookupName = normalizeIdentityLookupName(opponentName);
  const bucket = lookupName ? candidateIndex.get(lookupName) : null;
  const candidates = bucket ? Array.from(bucket.values()) : [];
  if (candidates.length === 1) return { status: "unique_candidate", candidates };
  if (candidates.length > 1) return { status: "ambiguous_candidate", candidates };
  return { status: "no_candidate", candidates: [] };
}

function summarizeUnresolvedOpponents(unresolvedByName, candidateIndex, limit = 50) {
  const rows = Array.from(unresolvedByName.values()).sort((a, b) => {
    if (b.match_rows !== a.match_rows) return b.match_rows - a.match_rows;
    return String(a.opponent_name).localeCompare(String(b.opponent_name));
  });

  const summary = {
    missing_rows: rows.reduce((sum, row) => sum + row.match_rows, 0),
    unique_names: rows.length,
    no_candidate_names: 0,
    ambiguous_candidate_names: 0,
    unique_candidate_names: 0,
    top: [],
  };

  for (const row of rows) {
    const classified = classifyOpponentName(row.opponent_name, candidateIndex);
    if (classified.status === "no_candidate") summary.no_candidate_names += 1;
    if (classified.status === "ambiguous_candidate") summary.ambiguous_candidate_names += 1;
    if (classified.status === "unique_candidate") summary.unique_candidate_names += 1;
    if (summary.top.length < limit) {
      summary.top.push({
        ...row,
        candidate_status: classified.status,
        candidate_count: classified.candidates.length,
        candidates: classified.candidates.slice(0, 5),
      });
    }
  }

  return summary;
}

function buildCoverageReport(options = {}) {
  const artifactDir = options.artifactDir || DEFAULT_ARTIFACT_DIR;
  const projectsDir = options.projectsDir || DEFAULT_PROJECTS_DIR;
  const files = listArtifactFiles(artifactDir);
  const candidateIndex = loadOpponentCandidateIndex(projectsDir);
  const samples = [];
  const unresolvedByName = new Map();
  let playersWithHistory = 0;
  let totalRows = 0;
  let rowsWithOpponentEntityId = 0;
  let rowsWithOpponentName = 0;

  for (const filePath of files) {
    const doc = readJson(filePath);
    const history = Array.isArray(doc.match_history) ? doc.match_history : [];
    if (history.length > 0) playersWithHistory += 1;

    let playerRows = 0;
    let playerRowsWithOpponentEntityId = 0;

    for (const row of history) {
      totalRows += 1;
      playerRows += 1;
      const opponentEntityId = String(row.opponent_entity_id || row.opponentEntityId || "").trim();
      const opponentName = String(row.opponent_name || row.opponentName || "").trim();
      if (opponentEntityId) {
        rowsWithOpponentEntityId += 1;
        playerRowsWithOpponentEntityId += 1;
      } else if (opponentName) {
        const key = normalizeIdentityLookupName(opponentName);
        const item = unresolvedByName.get(key) || {
          opponent_name: opponentName,
          lookup_name: key,
          match_rows: 0,
          player_samples: [],
        };
        item.match_rows += 1;
        if (item.player_samples.length < 5) {
          item.player_samples.push({
            player_entity_id: String(doc.player?.entity_id || ""),
            player_name: String(doc.player?.name || ""),
            file: path.relative(ROOT, filePath).replace(/\\/g, "/"),
          });
        }
        unresolvedByName.set(key, item);
      }
      if (opponentName) rowsWithOpponentName += 1;
    }

    if (playerRows > 0 && playerRowsWithOpponentEntityId < playerRows && samples.length < 20) {
      samples.push({
        file: path.relative(ROOT, filePath).replace(/\\/g, "/"),
        player_entity_id: String(doc.player?.entity_id || ""),
        player_name: String(doc.player?.name || ""),
        match_rows: playerRows,
        rows_with_opponent_entity_id: playerRowsWithOpponentEntityId,
        coverage_pct: percent(playerRowsWithOpponentEntityId, playerRows),
      });
    }
  }

  return {
    generated_at: options.generatedAt || new Date().toISOString(),
    artifact_dir: path.relative(ROOT, artifactDir).replace(/\\/g, "/"),
    artifact_files: files.length,
    players_with_history: playersWithHistory,
    match_rows: totalRows,
    rows_with_opponent_entity_id: rowsWithOpponentEntityId,
    rows_with_opponent_name: rowsWithOpponentName,
    opponent_entity_id_coverage_pct: percent(rowsWithOpponentEntityId, totalRows),
    opponent_name_coverage_pct: percent(rowsWithOpponentName, totalRows),
    ready_to_remove_name_fallback: totalRows > 0 && rowsWithOpponentEntityId === totalRows,
    incomplete_samples: samples,
    unresolved_opponents: summarizeUnresolvedOpponents(unresolvedByName, candidateIndex, options.unresolvedLimit || 50),
  };
}

function formatMarkdown(report) {
  const lines = [
    "# Player History Opponent Identity Coverage",
    "",
    `- generated_at: ${report.generated_at}`,
    `- artifact_dir: ${report.artifact_dir}`,
    `- artifact_files: ${report.artifact_files}`,
    `- players_with_history: ${report.players_with_history}`,
    `- match_rows: ${report.match_rows}`,
    `- rows_with_opponent_entity_id: ${report.rows_with_opponent_entity_id}`,
    `- rows_with_opponent_name: ${report.rows_with_opponent_name}`,
    `- opponent_entity_id_coverage_pct: ${report.opponent_entity_id_coverage_pct}`,
    `- opponent_name_coverage_pct: ${report.opponent_name_coverage_pct}`,
    `- ready_to_remove_name_fallback: ${report.ready_to_remove_name_fallback}`,
    `- unresolved_missing_rows: ${report.unresolved_opponents.missing_rows}`,
    `- unresolved_unique_names: ${report.unresolved_opponents.unique_names}`,
    `- unresolved_no_candidate_names: ${report.unresolved_opponents.no_candidate_names}`,
    `- unresolved_ambiguous_candidate_names: ${report.unresolved_opponents.ambiguous_candidate_names}`,
    `- unresolved_unique_candidate_names: ${report.unresolved_opponents.unique_candidate_names}`,
    "",
    "## Incomplete Samples",
    "",
  ];

  if (!report.incomplete_samples.length) {
    lines.push("- none");
  } else {
    for (const sample of report.incomplete_samples) {
      lines.push(
        `- ${sample.player_entity_id} ${sample.player_name}: ${sample.rows_with_opponent_entity_id}/${sample.match_rows} (${sample.coverage_pct}%) ${sample.file}`
      );
    }
  }

  lines.push("", "## Top Unresolved Opponents", "");
  if (!report.unresolved_opponents.top.length) {
    lines.push("- none");
  } else {
    for (const item of report.unresolved_opponents.top) {
      lines.push(
        `- ${item.opponent_name}: ${item.match_rows} rows, ${item.candidate_status}, candidates=${item.candidate_count}`
      );
    }
  }

  return `${lines.join("\n")}\n`;
}

function writeReport(report, options = {}) {
  const jsonPath = options.jsonPath || DEFAULT_JSON_REPORT;
  const markdownPath = options.markdownPath || DEFAULT_MD_REPORT;
  fs.mkdirSync(path.dirname(jsonPath), { recursive: true });
  fs.writeFileSync(jsonPath, `${JSON.stringify(report, null, 2)}\n`, "utf8");
  fs.writeFileSync(markdownPath, formatMarkdown(report), "utf8");
  return { jsonPath, markdownPath };
}

function main(argv = process.argv.slice(2)) {
  const artifactDir = argValue(argv, "--artifact-dir", DEFAULT_ARTIFACT_DIR);
  const report = buildCoverageReport({ artifactDir });
  const written = writeReport(report);
  console.log("Wrote player-history opponent identity coverage report.");
  console.log(`- json: ${path.relative(ROOT, written.jsonPath)}`);
  console.log(`- markdown: ${path.relative(ROOT, written.markdownPath)}`);
  console.log(`- match_rows: ${report.match_rows}`);
  console.log(`- opponent_entity_id_coverage_pct: ${report.opponent_entity_id_coverage_pct}`);
  console.log(`- ready_to_remove_name_fallback: ${report.ready_to_remove_name_fallback}`);
}

if (require.main === module) {
  main();
}

module.exports = {
  buildCoverageReport,
  classifyOpponentName,
  formatMarkdown,
  loadOpponentCandidateIndex,
  normalizeIdentityLookupName,
  summarizeUnresolvedOpponents,
  writeReport,
};
