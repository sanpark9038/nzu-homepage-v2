const fs = require("node:fs");
const path = require("node:path");

const ROOT = path.resolve(__dirname, "..", "..");
const REPORTS_DIR = path.join(ROOT, "tmp", "reports");
const SOURCE_REPORT = path.join(REPORTS_DIR, "team_roster_sync_report.json");

function readJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, "utf8").replace(/^\uFEFF/, ""));
}

function clean(value) {
  return String(value || "").trim();
}

function rowIdentity(row) {
  return {
    entity_id: clean(row && row.entity_id),
    name: clean(row && (row.name || row.name_prev || row.player_name)),
  };
}

function buildReview(syncReport) {
  const moved = (Array.isArray(syncReport && syncReport.moved) ? syncReport.moved : []).map((row) => ({
    ...rowIdentity(row),
    from: clean(row.from),
    to: clean(row.to),
    confidence: clean(row.change_confidence || "inferred"),
    action: "confirm_move_or_ignore",
  }));
  const tierChanged = (Array.isArray(syncReport && syncReport.tier_changed) ? syncReport.tier_changed : []).map((row) => ({
    ...rowIdentity(row),
    from: clean(row.from),
    to: clean(row.to),
    action: "confirm_tier_or_ignore",
  }));
  const raceChanged = (Array.isArray(syncReport && syncReport.race_changed) ? syncReport.race_changed : []).map((row) => ({
    ...rowIdentity(row),
    from: clean(row.from),
    to: clean(row.to),
    action: "confirm_race_or_ignore",
  }));
  const added = (Array.isArray(syncReport && syncReport.added) ? syncReport.added : []).map((row) => ({
    ...rowIdentity(row),
    to: clean(row.to),
    confidence: clean(row.change_confidence || "inferred"),
    action: "confirm_new_player_or_ignore",
  }));
  const conflicts = (Array.isArray(syncReport && syncReport.observed_conflicts) ? syncReport.observed_conflicts : []).map((row) => ({
    entity_id: clean(row.entity_id),
    name: clean(row.name_next || row.name_prev),
    from: clean(row.team_prev),
    to: clean(row.team_next),
    action: "manual_review_required",
  }));
  const guardedTeams = (Array.isArray(syncReport && syncReport.guarded_teams) ? syncReport.guarded_teams : []).map((row) => ({
    team_code: clean(row.team_code),
    reason: clean(row.reason),
    detail: clean(row.detail),
  }));

  return {
    generated_at: new Date().toISOString(),
    source_generated_at: clean(syncReport && syncReport.generated_at),
    source_report_only: Boolean(syncReport && syncReport.report_only),
    summary: {
      total_review_items: moved.length + tierChanged.length + raceChanged.length + added.length + conflicts.length,
      moved: moved.length,
      tier_changed: tierChanged.length,
      race_changed: raceChanged.length,
      added: added.length,
      conflicts: conflicts.length,
      guarded_teams: guardedTeams.length,
    },
    operator_flow: {
      edit_page: "/admin/roster",
      correction_storage: "roster_admin_corrections when remote admin storage is available, otherwise local admin fallback",
      pipeline_consumes: "loadMergedRosterAdminState()",
      homepage_update: "next approved Supabase sync publishes confirmed corrections to serving tables",
      publish_rule: "approved sync only",
    },
    review: {
      moved,
      tier_changed: tierChanged,
      race_changed: raceChanged,
      added,
      conflicts,
      guarded_teams: guardedTeams,
    },
  };
}

function markdownTable(rows, columns) {
  if (!rows.length) return "- none\n";
  const header = `| ${columns.map((column) => column.label).join(" | ")} |`;
  const sep = `| ${columns.map(() => "---").join(" | ")} |`;
  const body = rows.map((row) => `| ${columns.map((column) => clean(row[column.key]) || "-").join(" | ")} |`);
  return [header, sep, ...body].join("\n") + "\n";
}

function buildMarkdown(review) {
  const lines = [
    "# Roster Change Review",
    "",
    `- Generated: ${review.generated_at}`,
    `- Source report: tmp/reports/team_roster_sync_report.json`,
    `- Source report-only: ${review.source_report_only ? "yes" : "no"}`,
    `- Edit page: ${review.operator_flow.edit_page}`,
    `- Publish rule: ${review.operator_flow.publish_rule}`,
    "",
    "## Summary",
    "",
    `- Total review items: ${review.summary.total_review_items}`,
    `- Moves: ${review.summary.moved}`,
    `- Tier changes: ${review.summary.tier_changed}`,
    `- Race changes: ${review.summary.race_changed}`,
    `- New players: ${review.summary.added}`,
    `- Conflicts: ${review.summary.conflicts}`,
    `- Guarded teams: ${review.summary.guarded_teams}`,
    "",
    "## How To Confirm",
    "",
    "1. Open `/admin/roster`.",
    "2. Search the player name or entity id.",
    "3. Confirm the move, tier, race, or exclusion there.",
    "4. The correction is read by the next pipeline through `loadMergedRosterAdminState()`.",
    "5. Homepage serving changes only after an approved Supabase sync.",
    "",
    "## Move Suspects",
    "",
    markdownTable(review.review.moved, [
      { key: "entity_id", label: "entity_id" },
      { key: "name", label: "name" },
      { key: "from", label: "from" },
      { key: "to", label: "to" },
      { key: "confidence", label: "confidence" },
    ]),
    "",
    "## Tier Suspects",
    "",
    markdownTable(review.review.tier_changed, [
      { key: "entity_id", label: "entity_id" },
      { key: "name", label: "name" },
      { key: "from", label: "from" },
      { key: "to", label: "to" },
    ]),
    "",
    "## New Player Suspects",
    "",
    markdownTable(review.review.added, [
      { key: "entity_id", label: "entity_id" },
      { key: "name", label: "name" },
      { key: "to", label: "to" },
      { key: "confidence", label: "confidence" },
    ]),
    "",
    "## Conflicts",
    "",
    markdownTable(review.review.conflicts, [
      { key: "entity_id", label: "entity_id" },
      { key: "name", label: "name" },
      { key: "from", label: "from" },
      { key: "to", label: "to" },
    ]),
  ];
  return lines.join("\n");
}

function writeReview(review, options = {}) {
  const reportsDir = options.reportsDir || REPORTS_DIR;
  fs.mkdirSync(reportsDir, { recursive: true });
  const jsonPath = path.join(reportsDir, "roster_change_review_latest.json");
  const mdPath = path.join(reportsDir, "roster_change_review_latest.md");
  fs.writeFileSync(jsonPath, JSON.stringify(review, null, 2), "utf8");
  fs.writeFileSync(mdPath, buildMarkdown(review), "utf8");
  return { jsonPath, mdPath };
}

function main() {
  const sourcePath = process.argv.includes("--source")
    ? process.argv[process.argv.indexOf("--source") + 1]
    : SOURCE_REPORT;
  if (!sourcePath || !fs.existsSync(sourcePath)) {
    throw new Error(`Missing roster sync report: ${sourcePath || "<none>"}`);
  }
  const review = buildReview(readJson(sourcePath));
  const result = writeReview(review);
  console.log(JSON.stringify({
    ok: true,
    summary: review.summary,
    json_path: path.relative(ROOT, result.jsonPath).replace(/\\/g, "/"),
    md_path: path.relative(ROOT, result.mdPath).replace(/\\/g, "/"),
  }, null, 2));
}

if (require.main === module) {
  main();
}

module.exports = {
  buildReview,
  writeReview,
};
