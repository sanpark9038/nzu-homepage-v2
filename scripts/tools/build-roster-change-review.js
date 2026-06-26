const fs = require("node:fs");
const path = require("node:path");

const ROOT = path.resolve(__dirname, "..", "..");
const REPORTS_DIR = path.join(ROOT, "tmp", "reports");
const SOURCE_REPORT = path.join(REPORTS_DIR, "team_roster_sync_report.json");
const BASELINE_PATH = path.join(REPORTS_DIR, "manual_refresh_baseline.json");
const PROJECTS_DIR = path.join(ROOT, "data", "metadata", "projects");
const REVIEW_DECISIONS_PATH = path.join(ROOT, "data", "metadata", "roster_review_decisions.v1.json");
const OPPONENT_REVIEW_DECISIONS_PATH = path.join(
  ROOT,
  "data",
  "metadata",
  "opponent_identity_review_decisions.v1.json"
);
const {
  buildPlayerKey,
  loadBaselinePlayers,
  loadCurrentRosterState,
  loadCurrentRosterStateSnapshot,
} = require("./lib/discord-summary");

function readJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, "utf8").replace(/^\uFEFF/, ""));
}

function clean(value) {
  return String(value || "").trim();
}

function normalizeName(value) {
  return clean(value).toLowerCase();
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

function readExternalOpponentNames(decisionsPath = OPPONENT_REVIEW_DECISIONS_PATH) {
  if (!decisionsPath || !fs.existsSync(decisionsPath)) return new Set();
  try {
    const doc = readJson(decisionsPath);
    const rows = Array.isArray(doc.decisions) ? doc.decisions : [];
    return new Set(
      rows
        .filter((row) => clean(row.decision) === "external_opponent")
        .map((row) => normalizeName(row.opponent_name))
        .filter(Boolean)
    );
  } catch {
    return new Set();
  }
}

function rowIdentity(row) {
  return {
    entity_id: clean(row && row.entity_id),
    name: clean(row && (row.name || row.name_prev || row.player_name)),
  };
}

function playerName(player) {
  return clean(player && (player.player_name || player.display_name || player.name));
}

function playerTier(player) {
  return clean(player && (player.tier || player.player_tier));
}

function playerTeam(player) {
  return clean(player && (player.team_name || player.team_code));
}

function playerEntityId(player) {
  return clean(player && player.entity_id);
}

function loadComparisonPlayers(options = {}) {
  const previousRosterStatePlayers = Array.isArray(options.previousRosterStatePlayers)
    ? options.previousRosterStatePlayers
    : options.reportsDir
      ? loadCurrentRosterStateSnapshot(options.reportsDir)
      : [];
  const baselinePlayers = previousRosterStatePlayers.length
    ? previousRosterStatePlayers
    : Array.isArray(options.baselinePlayers)
    ? options.baselinePlayers
    : options.baselinePath && fs.existsSync(options.baselinePath)
      ? loadBaselinePlayers(options.baselinePath)
      : [];
  const currentPlayers = Array.isArray(options.currentPlayers)
    ? options.currentPlayers
    : options.projectsDir && fs.existsSync(options.projectsDir)
      ? loadCurrentRosterState(options.projectsDir)
      : [];
  return { baselinePlayers, currentPlayers };
}

function buildBaselineComparisonRows(options = {}) {
  const { baselinePlayers, currentPlayers } = loadComparisonPlayers(options);
  if (!baselinePlayers.length || !currentPlayers.length) {
    return { tierChanged: [], removed: [] };
  }

  const currentByKey = new Map(currentPlayers.map((player) => [buildPlayerKey(player), player]));
  const tierChanged = [];
  const removed = [];

  for (const previous of baselinePlayers) {
    const key = buildPlayerKey(previous);
    if (!key) continue;
    const current = currentByKey.get(key);
    const previousTier = playerTier(previous);
    const previousName = playerName(previous);
    const previousTeam = playerTeam(previous);
    const entityId = playerEntityId(previous);

    if (!current) {
      removed.push({
        entity_id: entityId,
        name: previousName,
        from: previousTeam,
        to: "",
        action: "confirm_exclusion_or_ignore",
        source: "baseline_comparison",
      });
      continue;
    }

    const currentTier = playerTier(current);
    if (previousTier && currentTier && previousTier !== currentTier) {
      tierChanged.push({
        entity_id: playerEntityId(current) || entityId,
        name: playerName(current) || previousName,
        from: previousTier,
        to: currentTier,
        action: "confirm_tier_or_ignore",
        source: "baseline_comparison",
      });
    }
  }

  return { tierChanged, removed };
}

function changeKey(kind, row) {
  return [kind, clean(row.entity_id), clean(row.name), clean(row.from), clean(row.to)].join("|");
}

function appendMissingRows(kind, rows, supplementalRows) {
  const seen = new Set(rows.map((row) => changeKey(kind, row)));
  const missing = supplementalRows.filter((row) => {
    const key = changeKey(kind, row);
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
  return [...rows, ...missing];
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

function isExternalOpponentNewCandidate(item, externalOpponentNames) {
  return item.review_kind === "new_candidate" && externalOpponentNames.has(normalizeName(item.name));
}

function buildReview(syncReport, options = {}) {
  const baselineComparison = buildBaselineComparisonRows(options);
  const moved = (Array.isArray(syncReport && syncReport.moved) ? syncReport.moved : []).map((row) => ({
    ...rowIdentity(row),
    from: clean(row.from),
    to: clean(row.to),
    confidence: clean(row.change_confidence || "inferred"),
    action: "confirm_move_or_ignore",
  }));
  const tierChanged = appendMissingRows(
    "tier_change",
    (Array.isArray(syncReport && syncReport.tier_changed) ? syncReport.tier_changed : []).map((row) => ({
      ...rowIdentity(row),
      from: clean(row.from),
      to: clean(row.to),
      action: "confirm_tier_or_ignore",
    })),
    baselineComparison.tierChanged
  );
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
  const removed = baselineComparison.removed;
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
    ...removed.map((row) => queueItem("excluded_candidate", row)),
    ...conflicts.map((row) => queueItem("conflict", row)),
  ];
  const excludedDecisionKeys = new Set(
    readReviewDecisions(options.decisionsPath)
      .filter((row) => clean(row.decision) === "excluded")
      .map(decisionMatchKey)
  );
  const externalOpponentNames = readExternalOpponentNames(options.opponentDecisionsPath);
  const supabasePlayerMap = options.supabasePlayerMap instanceof Map ? options.supabasePlayerMap : null;

  function isAlreadyAppliedInSupabase(item) {
    if (!supabasePlayerMap || !clean(item.entity_id)) return false;
    const supabasePlayer = supabasePlayerMap.get(clean(item.entity_id));
    if (!supabasePlayer) return false;
    if (item.review_kind === "affiliation_change") {
      const supabaseTeam = clean(supabasePlayer.university).toLowerCase();
      const detectedTeam = clean(item.to).toLowerCase();
      return Boolean(supabaseTeam && detectedTeam && supabaseTeam === detectedTeam);
    }
    if (item.review_kind === "new_candidate") return true;
    if (item.review_kind === "tier_change") {
      const supabaseTier = clean(supabasePlayer.tier).toLowerCase();
      const detectedTier = clean(item.to).toLowerCase();
      return Boolean(supabaseTier && detectedTier && supabaseTier === detectedTier);
    }
    return false;
  }

  const items = allItems.filter(
    (item) =>
      !isExcludedByOperator(item, excludedDecisionKeys) &&
      !isExternalOpponentNewCandidate(item, externalOpponentNames) &&
      !isAlreadyAppliedInSupabase(item)
  );
  const excludedByOperator = allItems.filter((item) => isExcludedByOperator(item, excludedDecisionKeys)).length;
  const excludedExternalOpponents = allItems.filter((item) =>
    isExternalOpponentNewCandidate(item, externalOpponentNames)
  ).length;
  const excludedAlreadyApplied = allItems.filter((item) => isAlreadyAppliedInSupabase(item)).length;

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
      removed: items.filter((item) => item.review_kind === "excluded_candidate").length,
      conflicts: items.filter((item) => item.review_kind === "conflict").length,
      guarded_teams: guardedTeams.length,
      excluded_by_operator: excludedByOperator,
      excluded_external_opponents: excludedExternalOpponents,
      excluded_already_applied: excludedAlreadyApplied,
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
      removed,
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
    `- Exclusion candidates: ${review.summary.removed}`,
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
    "## Exclusion Candidates",
    "",
    markdownTable(review.review.removed, [
      { key: "entity_id", label: "entity_id" },
      { key: "name", label: "name" },
      { key: "from", label: "from" },
      { key: "source", label: "source" },
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

async function main() {
  const sourcePath = process.argv.includes("--source")
    ? process.argv[process.argv.indexOf("--source") + 1]
    : SOURCE_REPORT;
  if (!sourcePath || !fs.existsSync(sourcePath)) {
    throw new Error(`Missing roster sync report: ${sourcePath || "<none>"}`);
  }

  let supabasePlayerMap = null;
  try {
    const { fetchSupabasePlayerMap } = require("./lib/supabase-roster-state");
    supabasePlayerMap = await fetchSupabasePlayerMap();
  } catch {}

  const review = buildReview(readJson(sourcePath), {
    reportsDir: REPORTS_DIR,
    baselinePath: BASELINE_PATH,
    projectsDir: PROJECTS_DIR,
    supabasePlayerMap,
  });
  const result = writeReview(review);
  console.log(JSON.stringify({
    ok: true,
    summary: review.summary,
    json_path: path.relative(ROOT, result.jsonPath).replace(/\\/g, "/"),
    md_path: path.relative(ROOT, result.mdPath).replace(/\\/g, "/"),
  }, null, 2));
}

if (require.main === module) {
  main().catch((error) => {
    console.error(error instanceof Error ? error.message : String(error));
    process.exit(1);
  });
}

module.exports = {
  buildReview,
  writeReview,
};
