const fs = require("fs");
const path = require("path");
const {
  LEDGER_PATH,
  loadOpponentIdentityAliases: ledgerAliases,
  loadOpponentIdentityDecisions: ledgerDecisions,
} = require("./lib/player-ledger");

const ROOT = path.join(__dirname, "..", "..");
const DEFAULT_ARTIFACT_DIR = path.join(ROOT, "tmp", "player-history-artifacts");
const REPORTS_DIR = path.join(ROOT, "tmp", "reports");
const DEFAULT_JSON_REPORT = path.join(REPORTS_DIR, "player_history_opponent_identity_coverage_latest.json");
const DEFAULT_MD_REPORT = path.join(REPORTS_DIR, "player_history_opponent_identity_coverage_latest.md");
const DEFAULT_REVIEW_QUEUE_JSON = path.join(REPORTS_DIR, "player_history_opponent_identity_review_queue_latest.json");
const DEFAULT_REVIEW_QUEUE_CSV = path.join(REPORTS_DIR, "player_history_opponent_identity_review_queue_latest.csv");
const DEFAULT_PROJECTS_DIR = path.join(ROOT, "data", "metadata", "projects");
// 상대 별명·상대 신원 결정은 선수 대장(player_ledger)에 흡수됐다. 로더가 대장/legacy 양쪽을 읽는다.
const DEFAULT_ALIAS_PATH = LEDGER_PATH;
const DEFAULT_REVIEW_DECISIONS_PATH = LEDGER_PATH;
const ALLOWED_REVIEW_DECISIONS = new Set(["canonical_candidate", "external_opponent"]);

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

function registerCandidateName(byLookupName, candidateName, candidate) {
  const lookupName = normalizeIdentityLookupName(candidateName);
  if (!lookupName) return;
  const bucket = byLookupName.get(lookupName) || new Map();
  bucket.set(candidate.entity_id, candidate);
  byLookupName.set(lookupName, bucket);
}

function loadOpponentIdentityAliases(aliasPath = DEFAULT_ALIAS_PATH) {
  const rows = ledgerAliases(aliasPath).aliases;
  return rows
    .map((row) => {
      const entityId = String(row.entity_id || "").trim();
      const aliases = Array.isArray(row.aliases)
        ? row.aliases.map((value) => String(value || "").trim()).filter(Boolean)
        : [];
      if (!entityId || !aliases.length) return null;
      return {
        entity_id: entityId,
        aliases,
        source: String(row.source || "").trim(),
      };
    })
    .filter(Boolean);
}

function loadOpponentReviewDecisions(decisionsPath = DEFAULT_REVIEW_DECISIONS_PATH) {
  const decisions = new Map();
  const rows = ledgerDecisions(decisionsPath).decisions;
  for (const row of rows) {
    const opponentName = String(row.opponent_name || "").trim();
    const decision = String(row.decision || "").trim();
    const lookupName = normalizeIdentityLookupName(opponentName);
    if (!lookupName || !ALLOWED_REVIEW_DECISIONS.has(decision)) continue;
    decisions.set(lookupName, {
      opponent_name: opponentName,
      decision,
    });
  }
  return decisions;
}

function loadOpponentCandidateIndex(projectsDir = DEFAULT_PROJECTS_DIR, aliasPath = DEFAULT_ALIAS_PATH) {
  const byLookupName = new Map();
  const byEntityId = new Map();
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
      const candidate = {
        entity_id: entityId,
        name,
        display_name: String(row.display_name || "").trim(),
        team_code: String(row.team_code || code || "").trim(),
      };
      byEntityId.set(entityId, candidate);
      for (const candidateName of [name, row.display_name]) {
        registerCandidateName(byLookupName, candidateName, candidate);
      }
    }
  }

  for (const row of loadOpponentIdentityAliases(aliasPath)) {
    const candidate = byEntityId.get(row.entity_id);
    if (!candidate) continue;
    for (const alias of row.aliases) {
      registerCandidateName(byLookupName, alias, candidate);
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

function incrementCount(map, key) {
  const normalized = String(key || "").trim() || "unknown";
  map.set(normalized, (map.get(normalized) || 0) + 1);
}

function sortCountObject(map) {
  return Object.fromEntries(
    Array.from(map.entries()).sort((a, b) => {
      if (b[1] !== a[1]) return b[1] - a[1];
      return String(a[0]).localeCompare(String(b[0]));
    })
  );
}

function recommendUnresolvedOpponent(row, candidateStatus) {
  if (candidateStatus === "unique_candidate") return "metadata_review_needed";
  if (candidateStatus === "ambiguous_candidate") return "manual_disambiguation_needed";
  if (row.match_rows >= 100) return "external_or_metadata_review_needed";
  if (row.match_rows >= 10) return "external_candidate";
  return "ignore_low_frequency";
}

function decisionPromptForRecommendedAction(action) {
  if (action === "metadata_review_needed") return "approve_alias_or_reject";
  if (action === "manual_disambiguation_needed") return "choose_entity_or_mark_external";
  if (action === "external_or_metadata_review_needed") return "classify_as_canonical_or_external";
  if (action === "external_candidate") return "mark_external_or_leave_unrecorded";
  return "leave_unrecorded";
}

function normalizePlayerSamples(samples, limit = 5) {
  if (!Array.isArray(samples)) return [];
  return samples
    .slice(0, limit)
    .map((sample) => ({
      player_entity_id: String(sample.player_entity_id || "").trim(),
      player_name: String(sample.player_name || "").trim(),
    }))
    .filter((sample) => sample.player_entity_id || sample.player_name);
}

function normalizeCandidatePreview(candidates, limit = 5) {
  if (!Array.isArray(candidates)) return [];
  return candidates
    .slice(0, limit)
    .map((candidate) => ({
      entity_id: String(candidate.entity_id || "").trim(),
      name: String(candidate.name || "").trim(),
      display_name: String(candidate.display_name || "").trim(),
      team_code: String(candidate.team_code || "").trim(),
    }))
    .filter((candidate) => candidate.entity_id || candidate.name || candidate.display_name || candidate.team_code);
}

function isOperatorReviewAction(action) {
  return Boolean(action) && action !== "ignore_low_frequency" && !String(action).startsWith("reviewed_");
}

function buildOperatorReviewQueue(rows, limit = 50) {
  const reviewRows = rows.filter((row) => isOperatorReviewAction(row.recommended_action));
  return {
    total_names: reviewRows.length,
    total_rows: reviewRows.reduce((sum, row) => sum + Number(row.match_rows || 0), 0),
    limit,
    items: reviewRows.slice(0, limit).map((row, index) => ({
      rank: index + 1,
      opponent_name: row.opponent_name,
      match_rows: Number(row.match_rows || 0),
      latest_match_date: row.latest_match_date || null,
      candidate_status: row.candidate_status,
      candidate_count: Number(row.candidate_count || 0),
      recommended_action: row.recommended_action,
      decision_prompt: decisionPromptForRecommendedAction(row.recommended_action),
      opponent_race_counts: row.opponent_race_counts || {},
      player_samples: normalizePlayerSamples(row.player_samples),
      candidate_preview: normalizeCandidatePreview(row.candidates),
    })),
  };
}

function summarizeRecommendedActions(rows) {
  const counts = new Map();
  for (const row of rows) {
    incrementCount(counts, row.recommended_action || "unknown");
  }
  return sortCountObject(counts);
}

function summarizeRecommendedActionRows(rows) {
  const counts = new Map();
  for (const row of rows) {
    const action = row.recommended_action || "unknown";
    counts.set(action, (counts.get(action) || 0) + Number(row.match_rows || 0));
  }
  return sortCountObject(counts);
}

function groupTopUnresolvedByAction(rows, perActionLimit = 20) {
  const grouped = {};
  for (const row of rows) {
    const key = row.recommended_action || "unknown";
    if (!grouped[key]) grouped[key] = [];
    if (grouped[key].length < perActionLimit) grouped[key].push(row);
  }
  return grouped;
}

function reviewedActionForDecision(decision) {
  if (decision === "external_opponent") return "reviewed_external_opponent";
  if (decision === "canonical_candidate") return "reviewed_canonical_candidate";
  return null;
}

function summarizeUnresolvedOpponents(unresolvedByName, candidateIndex, limit = 50, reviewDecisions = new Map()) {
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

  const all = [];

  for (const row of rows) {
    const classified = classifyOpponentName(row.opponent_name, candidateIndex);
    if (classified.status === "no_candidate") summary.no_candidate_names += 1;
    if (classified.status === "ambiguous_candidate") summary.ambiguous_candidate_names += 1;
    if (classified.status === "unique_candidate") summary.unique_candidate_names += 1;
    const reviewDecision = reviewDecisions.get(row.lookup_name) || null;
    const reviewedAction = reviewedActionForDecision(reviewDecision?.decision);
    all.push({
      opponent_name: row.opponent_name,
      lookup_name: row.lookup_name,
      match_rows: row.match_rows,
      latest_match_date: row.latest_match_date || null,
      opponent_race_counts: sortCountObject(row.opponent_race_counts || new Map()),
      player_samples: row.player_samples,
      candidate_status: classified.status,
      candidate_count: classified.candidates.length,
      candidates: classified.candidates.slice(0, 5),
      review_decision: reviewDecision?.decision || null,
      recommended_action: reviewedAction || recommendUnresolvedOpponent(row, classified.status),
    });
  }

  summary.recommended_action_counts = summarizeRecommendedActions(all);
  summary.recommended_action_row_counts = summarizeRecommendedActionRows(all);
  summary.operator_review_queue = buildOperatorReviewQueue(all, limit);
  summary.top = all.slice(0, limit);
  summary.by_recommended_action = groupTopUnresolvedByAction(all, 20);

  return summary;
}

function buildFallbackDependencySummary(totalRows, rowsWithOpponentEntityId, unresolvedOpponents) {
  const rowCounts = unresolvedOpponents.recommended_action_row_counts || {};
  const rowsRequiringNameFallback = Math.max(0, totalRows - rowsWithOpponentEntityId);
  return {
    rows_requiring_name_fallback: rowsRequiringNameFallback,
    rows_requiring_name_fallback_pct: percent(rowsRequiringNameFallback, totalRows),
    unresolved_unique_names: unresolvedOpponents.unique_names || 0,
    metadata_review_rows: rowCounts.metadata_review_needed || 0,
    manual_disambiguation_rows: rowCounts.manual_disambiguation_needed || 0,
    external_or_metadata_review_rows: rowCounts.external_or_metadata_review_needed || 0,
    external_candidate_rows: rowCounts.external_candidate || 0,
    reviewed_external_rows: rowCounts.reviewed_external_opponent || 0,
    reviewed_canonical_candidate_rows: rowCounts.reviewed_canonical_candidate || 0,
    ignored_low_frequency_rows: rowCounts.ignore_low_frequency || 0,
    ready_to_remove_name_fallback: totalRows > 0 && rowsWithOpponentEntityId === totalRows,
  };
}

function buildCoverageReport(options = {}) {
  const artifactDir = options.artifactDir || DEFAULT_ARTIFACT_DIR;
  const projectsDir = options.projectsDir || DEFAULT_PROJECTS_DIR;
  const aliasPath = options.aliasPath === undefined ? DEFAULT_ALIAS_PATH : options.aliasPath;
  const reviewDecisionsPath =
    options.reviewDecisionsPath === undefined ? DEFAULT_REVIEW_DECISIONS_PATH : options.reviewDecisionsPath;
  const files = listArtifactFiles(artifactDir);
  const candidateIndex = loadOpponentCandidateIndex(projectsDir, aliasPath);
  const reviewDecisions = loadOpponentReviewDecisions(reviewDecisionsPath);
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
          latest_match_date: null,
          opponent_race_counts: new Map(),
          player_samples: [],
          player_sample_keys: new Set(),
        };
        item.match_rows += 1;
        const matchDate = String(row.match_date || row.matchDate || "").trim();
        if (matchDate && (!item.latest_match_date || matchDate > item.latest_match_date)) {
          item.latest_match_date = matchDate;
        }
        incrementCount(item.opponent_race_counts, row.opponent_race || row.opponentRace || "");
        const sampleKey = String(doc.player?.entity_id || "");
        if (item.player_samples.length < 5 && sampleKey && !item.player_sample_keys.has(sampleKey)) {
          item.player_sample_keys.add(sampleKey);
          item.player_samples.push({
            player_entity_id: sampleKey,
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

  const unresolvedOpponents = summarizeUnresolvedOpponents(
    unresolvedByName,
    candidateIndex,
    options.unresolvedLimit || 50,
    reviewDecisions
  );

  return {
    generated_at: options.generatedAt || new Date().toISOString(),
    artifact_dir: path.relative(ROOT, artifactDir).replace(/\\/g, "/"),
    opponent_alias_path: aliasPath ? path.relative(ROOT, aliasPath).replace(/\\/g, "/") : null,
    opponent_review_decisions_path: reviewDecisionsPath
      ? path.relative(ROOT, reviewDecisionsPath).replace(/\\/g, "/")
      : null,
    artifact_files: files.length,
    players_with_history: playersWithHistory,
    match_rows: totalRows,
    rows_with_opponent_entity_id: rowsWithOpponentEntityId,
    rows_with_opponent_name: rowsWithOpponentName,
    opponent_entity_id_coverage_pct: percent(rowsWithOpponentEntityId, totalRows),
    opponent_name_coverage_pct: percent(rowsWithOpponentName, totalRows),
    ready_to_remove_name_fallback: totalRows > 0 && rowsWithOpponentEntityId === totalRows,
    incomplete_samples: samples,
    fallback_dependency: buildFallbackDependencySummary(totalRows, rowsWithOpponentEntityId, unresolvedOpponents),
    unresolved_opponents: unresolvedOpponents,
  };
}

function formatMarkdown(report) {
  const fallbackDependency =
    report.fallback_dependency ||
    buildFallbackDependencySummary(
      Number(report.match_rows || 0),
      Number(report.rows_with_opponent_entity_id || 0),
      report.unresolved_opponents || {}
    );
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
    `- unresolved_recommended_action_counts: ${JSON.stringify(report.unresolved_opponents.recommended_action_counts)}`,
    "",
    "## Fallback Dependency",
    "",
    `- rows_requiring_name_fallback: ${fallbackDependency.rows_requiring_name_fallback}`,
    `- rows_requiring_name_fallback_pct: ${fallbackDependency.rows_requiring_name_fallback_pct}`,
    `- unresolved_unique_names: ${fallbackDependency.unresolved_unique_names}`,
    `- metadata_review_rows: ${fallbackDependency.metadata_review_rows}`,
    `- manual_disambiguation_rows: ${fallbackDependency.manual_disambiguation_rows}`,
    `- external_or_metadata_review_rows: ${fallbackDependency.external_or_metadata_review_rows}`,
    `- external_candidate_rows: ${fallbackDependency.external_candidate_rows}`,
    `- reviewed_external_rows: ${fallbackDependency.reviewed_external_rows}`,
    `- reviewed_canonical_candidate_rows: ${fallbackDependency.reviewed_canonical_candidate_rows}`,
    `- ignored_low_frequency_rows: ${fallbackDependency.ignored_low_frequency_rows}`,
    "",
  ];

  const reviewQueue = report.unresolved_opponents.operator_review_queue || {
    total_names: 0,
    total_rows: 0,
    items: [],
  };
  lines.push(
    "## Operator Review Queue",
    "",
    `- total_names: ${reviewQueue.total_names}`,
    `- total_rows: ${reviewQueue.total_rows}`,
    ""
  );
  if (!reviewQueue.items.length) {
    lines.push("- none");
  } else {
    for (const item of reviewQueue.items) {
      const raceSummary = formatCountSummary(item.opponent_race_counts);
      const sampleSummary = formatPlayerSampleSummary(item.player_samples);
      const candidateSummary = formatCandidateSummary(item.candidate_preview);
      lines.push(
        `- #${item.rank} ${item.opponent_name}: ${item.match_rows} rows, latest=${item.latest_match_date || "n/a"}, ${item.recommended_action}, decision=${item.decision_prompt}, races=${raceSummary || "n/a"}, samples=${sampleSummary || "n/a"}, candidates=${candidateSummary || "n/a"}`
      );
    }
  }

  lines.push("", "## Incomplete Samples", "");

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
        `- ${item.opponent_name}: ${item.match_rows} rows, latest=${item.latest_match_date || "n/a"}, ${item.candidate_status}, ${item.recommended_action}, candidates=${item.candidate_count}`
      );
    }
  }

  lines.push("", "## Review Groups", "");
  const groupOrder = [
    "metadata_review_needed",
    "manual_disambiguation_needed",
    "external_or_metadata_review_needed",
    "external_candidate",
    "reviewed_external_opponent",
    "reviewed_canonical_candidate",
    "ignore_low_frequency",
  ];
  for (const action of groupOrder) {
    const rows = report.unresolved_opponents.by_recommended_action?.[action] || [];
    if (!rows.length) continue;
    lines.push(`### ${action}`, "");
    for (const item of rows) {
      lines.push(
        `- ${item.opponent_name}: ${item.match_rows} rows, latest=${item.latest_match_date || "n/a"}, ${item.candidate_status}, candidates=${item.candidate_count}`
      );
    }
    lines.push("");
  }

  return `${lines.join("\n")}\n`;
}

function csvValue(value) {
  const text = String(value ?? "");
  if (/[",\r\n]/.test(text)) {
    return `"${text.replace(/"/g, '""')}"`;
  }
  return text;
}

function formatCountSummary(counts) {
  if (!counts || typeof counts !== "object") return "";
  return Object.entries(counts)
    .filter(([, count]) => Number(count) > 0)
    .sort((a, b) => {
      if (Number(b[1]) !== Number(a[1])) return Number(b[1]) - Number(a[1]);
      return String(a[0]).localeCompare(String(b[0]));
    })
    .map(([key, count]) => `${key}:${count}`)
    .join("; ");
}

function formatPlayerSampleSummary(samples) {
  if (!Array.isArray(samples)) return "";
  return samples
    .map((sample) => {
      const name = String(sample.player_name || "").trim();
      const id = String(sample.player_entity_id || "").trim();
      if (name && id) return `${name} (${id})`;
      return name || id;
    })
    .filter(Boolean)
    .join("; ");
}

function formatCandidateSummary(candidates) {
  if (!Array.isArray(candidates)) return "";
  return candidates
    .map((candidate) => {
      const name = String(candidate.display_name || candidate.name || "").trim();
      const id = String(candidate.entity_id || "").trim();
      const teamCode = String(candidate.team_code || "").trim();
      const label = [name, teamCode].filter(Boolean).join(" / ");
      if (label && id) return `${label} (${id})`;
      return label || id;
    })
    .filter(Boolean)
    .join("; ");
}

function formatReviewQueueCsv(queue) {
  const headers = [
    "rank",
    "opponent_name",
    "match_rows",
    "latest_match_date",
    "candidate_status",
    "candidate_count",
    "recommended_action",
    "decision_prompt",
    "opponent_race_counts",
    "player_samples",
    "candidate_preview",
  ];
  const rows = Array.isArray(queue?.items) ? queue.items : [];
  return `\uFEFF${[
    headers.join(","),
    ...rows.map((item) =>
      headers
        .map((header) => {
          if (header === "opponent_race_counts") return csvValue(formatCountSummary(item.opponent_race_counts));
          if (header === "player_samples") return csvValue(formatPlayerSampleSummary(item.player_samples));
          if (header === "candidate_preview") return csvValue(formatCandidateSummary(item.candidate_preview));
          return csvValue(item[header]);
        })
        .join(",")
    ),
  ].join("\n")}\n`;
}

function writeReport(report, options = {}) {
  const jsonPath = options.jsonPath || DEFAULT_JSON_REPORT;
  const markdownPath = options.markdownPath || DEFAULT_MD_REPORT;
  const reviewQueueJsonPath = options.reviewQueueJsonPath || DEFAULT_REVIEW_QUEUE_JSON;
  const reviewQueueCsvPath = options.reviewQueueCsvPath || DEFAULT_REVIEW_QUEUE_CSV;
  const reviewQueue = report.unresolved_opponents?.operator_review_queue || {
    total_names: 0,
    total_rows: 0,
    limit: 0,
    items: [],
  };
  fs.mkdirSync(path.dirname(jsonPath), { recursive: true });
  fs.mkdirSync(path.dirname(reviewQueueJsonPath), { recursive: true });
  fs.mkdirSync(path.dirname(reviewQueueCsvPath), { recursive: true });
  fs.writeFileSync(jsonPath, `${JSON.stringify(report, null, 2)}\n`, "utf8");
  fs.writeFileSync(markdownPath, formatMarkdown(report), "utf8");
  fs.writeFileSync(reviewQueueJsonPath, `${JSON.stringify(reviewQueue, null, 2)}\n`, "utf8");
  fs.writeFileSync(reviewQueueCsvPath, formatReviewQueueCsv(reviewQueue), "utf8");
  return { jsonPath, markdownPath, reviewQueueJsonPath, reviewQueueCsvPath };
}

function main(argv = process.argv.slice(2)) {
  const artifactDir = argValue(argv, "--artifact-dir", DEFAULT_ARTIFACT_DIR);
  const aliasPath = argValue(argv, "--alias-path", DEFAULT_ALIAS_PATH);
  const reviewDecisionsPath = argValue(argv, "--review-decisions-path", DEFAULT_REVIEW_DECISIONS_PATH);
  const report = buildCoverageReport({ artifactDir, aliasPath, reviewDecisionsPath });
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
  DEFAULT_ALIAS_PATH,
  DEFAULT_REVIEW_DECISIONS_PATH,
  buildCoverageReport,
  buildOperatorReviewQueue,
  classifyOpponentName,
  formatMarkdown,
  loadOpponentIdentityAliases,
  loadOpponentReviewDecisions,
  loadOpponentCandidateIndex,
  normalizeIdentityLookupName,
  recommendUnresolvedOpponent,
  summarizeRecommendedActionRows,
  groupTopUnresolvedByAction,
  summarizeUnresolvedOpponents,
  summarizeRecommendedActions,
  writeReport,
};
