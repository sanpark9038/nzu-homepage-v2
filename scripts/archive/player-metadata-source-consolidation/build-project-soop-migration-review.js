const fs = require("fs");
const path = require("path");

const ROOT = path.resolve(__dirname, "..", "..");
const CONSOLIDATION_REPORT_PATH = path.join(ROOT, "tmp", "reports", "player_metadata_source_consolidation_latest.json");
const REPORTS_DIR = path.join(ROOT, "tmp", "reports");

function readJson(filePath, fallback) {
  if (!fs.existsSync(filePath)) return fallback;
  return JSON.parse(fs.readFileSync(filePath, "utf8").replace(/^\uFEFF/, ""));
}

function writeText(filePath, value) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, value, "utf8");
}

function writeJson(filePath, value) {
  writeText(filePath, `${JSON.stringify(value, null, 2)}\n`);
}

function trim(value) {
  return String(value || "").trim();
}

function parseArgs(argv) {
  const projectArg = argv.find((arg) => arg.startsWith("--project="));
  const project = projectArg ? trim(projectArg.slice("--project=".length)) : "";
  if (!project) {
    throw new Error("Missing required --project=<code> argument.");
  }
  return { project };
}

function escapeMarkdown(value) {
  return trim(value).replace(/\|/g, "\\|").replace(/\r?\n/g, " ");
}

function soopUrl(soopUserId) {
  return `https://ch.sooplive.co.kr/${encodeURIComponent(soopUserId)}`;
}

function buildReviewRows(report, project) {
  const candidates = Array.isArray(report.safe_soop_id_migration_candidates)
    ? report.safe_soop_id_migration_candidates
    : [];
  return candidates
    .filter((candidate) => candidate.project === project)
    .map((candidate, index) => ({
      review_status: "",
      row: index + 1,
      project,
      player: trim(candidate.display_name) || trim(candidate.name),
      project_name: trim(candidate.name),
      legacy_name: trim(candidate.legacy_name),
      wr_id: trim(candidate.gender_wr_id).split(":")[1] || "",
      gender: trim(candidate.gender_wr_id).split(":")[0] || "",
      entity_id: trim(candidate.entity_id),
      soop_user_id: trim(candidate.legacy_soop_user_id),
      soop_url: soopUrl(trim(candidate.legacy_soop_user_id)),
      evidence: "성별+wr_id 일치, 이름 일치",
    }));
}

function markdownTable(rows, project) {
  const lines = [
    `# ${project.toUpperCase()} SOOP ID 이관 검토표`,
    "",
    "- 확인 상태 칸에 `OK` 또는 `보류`를 적어 검토합니다.",
    "- 이 표는 기준 데이터에 쓰기 전 검토용입니다.",
    "- 근거는 자동 이관 후보 조건이며, 최종 확정은 운영자 확인을 우선합니다.",
    "",
    "| 확인 상태 | 선수 | wr_id | 성별 | entity_id | SOOP ID | SOOP URL | 근거 |",
    "|---|---|---:|---|---|---|---|---|",
  ];

  for (const row of rows) {
    lines.push(
      [
        row.review_status,
        row.player,
        row.wr_id,
        row.gender,
        row.entity_id,
        row.soop_user_id,
        row.soop_url,
        row.evidence,
      ]
        .map(escapeMarkdown)
        .join(" | ")
        .replace(/^/, "| ")
        .replace(/$/, " |")
    );
  }

  lines.push("");
  return lines.join("\n");
}

function buildReview(project) {
  const report = readJson(CONSOLIDATION_REPORT_PATH, null);
  if (!report) {
    throw new Error(`Missing ${path.relative(ROOT, CONSOLIDATION_REPORT_PATH)}. Run report:metadata:source-consolidation first.`);
  }

  const rows = buildReviewRows(report, project);
  const baseName = `project_soop_migration_review.${project}`;
  const jsonPath = path.join(REPORTS_DIR, `${baseName}.json`);
  const markdownPath = path.join(REPORTS_DIR, `${baseName}.md`);
  const output = {
    generated_at: new Date().toISOString(),
    project,
    source_report: path.relative(ROOT, CONSOLIDATION_REPORT_PATH).replace(/\\/g, "/"),
    count: rows.length,
    rows,
  };

  writeJson(jsonPath, output);
  writeText(markdownPath, markdownTable(rows, project));

  return {
    jsonPath,
    markdownPath,
    output,
  };
}

function main() {
  const { project } = parseArgs(process.argv.slice(2));
  const result = buildReview(project);
  console.log("Wrote project SOOP migration review.");
  console.log(`- project: ${project}`);
  console.log(`- count: ${result.output.count}`);
  console.log(`- markdown: ${path.relative(ROOT, result.markdownPath)}`);
  console.log(`- json: ${path.relative(ROOT, result.jsonPath)}`);
}

if (require.main === module) {
  main();
}

module.exports = {
  buildReview,
  buildReviewRows,
  parseArgs,
};
