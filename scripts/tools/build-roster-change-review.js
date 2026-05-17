const fs = require("node:fs");
const path = require("node:path");

const ROOT = path.resolve(__dirname, "..", "..");
const REPORTS_DIR = path.join(ROOT, "tmp", "reports");
const SOURCE_REPORT = path.join(REPORTS_DIR, "team_roster_sync_report.json");
const REVIEW_DECISIONS_PATH = path.join(ROOT, "data", "metadata", "roster_review_decisions.v1.json");

function readJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, "utf8").replace(/^\uFEFF/, ""));
}

function clean(value) {
  return String(value || "").trim();
}

function readReviewDecisions(decisionsPath = REVIEW_DECISIONS_PATH) {
  if (!decisionsPath || !fs.existsSync(decisionsPath)) return [];
  try {
    const doc = readJson(decisionsPath);
    return Array.isArray(doc.decisions) ? doc.decisions : [];
  } catch {
    return [];
  }
}

function rowIdentity(row) {
  return {
    entity_id: clean(row && row.entity_id),
    name: clean(row && (row.name || row.name_prev || row.player_name)),
  };
}

function decisionUrl(kind, row) {
  const params = new URLSearchParams();
  params.set("review", kind);
  if (row.entity_id) params.set("entity_id", row.entity_id);
  if (kind === "affiliation_change" || kind === "new_candidate") params.set("team_code", row.to);
  if (kind === "tier_change") params.set("tier", row.to);
  if (kind === "race_change") params.set("race", row.to);
  return `/admin/roster?${params.toString()}`;
}

function queueItem(kind, row) {
  return {
    ...row,
    review_kind: kind,
    operator_status: "pending",
    match_collection_note:
      kind === "new_candidate"
        ? "Match collection starts after the candidate is approved into the roster baseline."
        : "Match collection continues independently from this roster baseline review.",
    decision_url: decisionUrl(kind, row),
  };
}

function decisionMatchKey(row) {
  return [
    clean(row.review_kind),
    clean(row.entity_id),
    clean(row.observed_from || row.from),
    clean(row.observed_to || row.to),
  ].join("|");
}

function isExcludedByOperator(item, excludedDecisionKeys) {
  return excludedDecisionKeys.has(decisionMatchKey(item));
}

function buildReview(syncReport, options = {}) {
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
  const allItems = [
    ...moved.map((row) => queueItem("affiliation_change", row)),
    ...tierChanged.map((row) => queueItem("tier_change", row)),
    ...raceChanged.map((row) => queueItem("race_change", row)),
    ...added.map((row) => queueItem("new_candidate", row)),
    ...conflicts.map((row) => queueItem("conflict", row)),
  ];
  const excludedDecisionKeys = new Set(
    readReviewDecisions(options.decisionsPath)
      .filter((row) => clean(row.decision) === "excluded")
      .map(decisionMatchKey)
  );
  const items = allItems.filter((item) => !isExcludedByOperator(item, excludedDecisionKeys));
  const excludedByOperator = allItems.length - items.length;

  return {
    generated_at: new Date().toISOString(),
    source_generated_at: clean(syncReport && syncReport.generated_at),
    source_report_only: Boolean(syncReport && syncReport.report_only),
    summary: {
      total_review_items: items.length,
      moved: items.filter((item) => item.review_kind === "affiliation_change").length,
      tier_changed: items.filter((item) => item.review_kind === "tier_change").length,
      race_changed: items.filter((item) => item.review_kind === "race_change").length,
      added: items.filter((item) => item.review_kind === "new_candidate").length,
      conflicts: items.filter((item) => item.review_kind === "conflict").length,
      guarded_teams: guardedTeams.length,
      excluded_by_operator: excludedByOperator,
    },
    items,
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
