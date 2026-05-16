const fs = require("fs");
const path = require("path");

const ROOT = path.join(__dirname, "..", "..");
const DEFAULT_ARTIFACT_DIR = path.join(ROOT, "tmp", "player-history-artifacts");
const REPORTS_DIR = path.join(ROOT, "tmp", "reports");
const DEFAULT_JSON_REPORT = path.join(REPORTS_DIR, "player_history_opponent_identity_coverage_latest.json");
const DEFAULT_MD_REPORT = path.join(REPORTS_DIR, "player_history_opponent_identity_coverage_latest.md");

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

function buildCoverageReport(options = {}) {
  const artifactDir = options.artifactDir || DEFAULT_ARTIFACT_DIR;
  const files = listArtifactFiles(artifactDir);
  const samples = [];
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
  formatMarkdown,
  writeReport,
};
