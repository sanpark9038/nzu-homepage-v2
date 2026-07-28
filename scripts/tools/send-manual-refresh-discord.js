const fs = require("fs");
const path = require("path");
require("dotenv").config({ path: path.join(__dirname, "..", "..", ".env.local") });
const { shouldApplyManualTierOverride } = require("./lib/roster-admin-store");
const { loadRosterManualOverrides } = require("./lib/player-ledger");
const {
  buildDiscordSummaryCheck,
  buildPlayerKey,
  mergedEntityIdLookup,
  loadBaselinePlayers,
  loadCurrentRosterState,
  loadCurrentRosterStateSnapshot,
  normalizeTeamName,
  readJsonIfExists,
  resolveLatestReportFile,
  writeCurrentRosterStateSnapshot,
} = require("./lib/discord-summary");

const ROOT = path.resolve(__dirname, "..", "..");
const REPORTS_DIR = path.join(ROOT, "tmp", "reports");
const PROJECTS_DIR = path.join(ROOT, "data", "metadata", "projects");
const BASELINE_PATH = path.join(REPORTS_DIR, "manual_refresh_baseline.json");
const MANUAL_REFRESH_REPORT_PATH = path.join(REPORTS_DIR, "manual_refresh_latest.json");
const OPS_PIPELINE_REPORT_PATH = path.join(REPORTS_DIR, "ops_pipeline_latest.json");
const COLLECTION_SOURCES_HEALTH_PATH = path.join(REPORTS_DIR, "pipeline_collection_sources_health_latest.json");

function argValue(flag, fallback = null) {
  const idx = process.argv.indexOf(flag);
  if (idx >= 0 && process.argv[idx + 1]) return process.argv[idx + 1];
  return fallback;
}

function hasFlag(flag) {
  return process.argv.includes(flag);
}

function toPlayerMap(players, lookup = mergedEntityIdLookup({ reportsDir: REPORTS_DIR })) {
  return new Map(players.map((player) => [buildPlayerKey(player, lookup), player]));
}

function normalizeName(value) {
  return String(value || "").trim();
}

function normalizeEntityId(value) {
  return String(value || "").trim();
}

function loadManualOverrides() {
  return loadRosterManualOverrides().overrides;
}

function buildManualOverrideLookup() {
  const byEntityId = new Map();
  const byName = new Map();
  for (const row of loadManualOverrides()) {
    const entityId = normalizeEntityId(row && row.entity_id);
    const name = normalizeName(row && row.name);
    if (entityId) byEntityId.set(entityId, row);
    if (name && !byName.has(name)) byName.set(name, row);
  }
  return { byEntityId, byName };
}

function resolveManualOverrideForPlayer(player, lookup) {
  if (!player || !lookup) return null;
  const entityId = normalizeEntityId(player.entity_id);
  if (entityId && lookup.byEntityId.has(entityId)) return lookup.byEntityId.get(entityId);
  const name = normalizeName(player.name || player.display_name);
  if (name && lookup.byName.has(name)) return lookup.byName.get(name);
  return null;
}

function buildAffiliationConfidenceLookup(options = {}) {
  const reportsDir =
    options && String(options.reportsDir || "").trim()
      ? path.resolve(String(options.reportsDir).trim())
      : REPORTS_DIR;
  const syncReport = readJsonIfExists(path.join(reportsDir, "team_roster_sync_report.json"));
  const lookup =
    options && options.identityLookup instanceof Map
      ? options.identityLookup
      : mergedEntityIdLookup({ reportsDir });
  const rows = Array.isArray(syncReport && syncReport.moved) ? syncReport.moved : [];
  const result = new Map();
  for (const row of rows) {
    const key = buildPlayerKey(
      {
        entity_id: String(row && row.entity_id ? row.entity_id : ""),
        name: String(row && row.name ? row.name : ""),
      },
      lookup
    );
    if (!key) continue;
    result.set(key, String(row && row.change_confidence ? row.change_confidence : "inferred").trim() || "inferred");
  }
  return result;
}

function formatAffiliationChangeRow(item) {
  const confidence = String(item && item.change_confidence ? item.change_confidence : "inferred").trim().toLowerCase();
  if (confidence === "fallback") {
    return `- ${item.player_name} : 소속 미확인, 연속성 보정으로 ${item.old_team} -> ${item.new_team} 처리`;
  }
  if (confidence === "inferred") {
    return `- ${item.player_name} : ${item.old_team} -> ${item.new_team} (관측 기반 추정)`;
  }
  return `- ${item.player_name} : ${item.old_team} -> ${item.new_team}`;
}

function comparePlayerChanges(beforePlayers, afterPlayers, options = {}) {
  const identityLookup = options && options.identityLookup instanceof Map
    ? options.identityLookup
    : mergedEntityIdLookup({ reportsDir: REPORTS_DIR });
  const beforeMap = toPlayerMap(beforePlayers, identityLookup);
  const afterMap = toPlayerMap(afterPlayers, identityLookup);
  const manualOverrideLookup = buildManualOverrideLookup();
  const affiliationConfidenceLookup =
    options && options.affiliationConfidenceLookup instanceof Map
      ? options.affiliationConfidenceLookup
      : buildAffiliationConfidenceLookup({ identityLookup });
  const tierChanges = [];
  const affiliationChanges = [];
  const joiners = [];
  const removals = [];

  for (const [key, current] of afterMap.entries()) {
    const prev = beforeMap.get(key);
    if (!prev) {
      joiners.push({
        player_name: current.display_name || current.name,
        team_name: normalizeTeamName(current.team_name),
      });
      continue;
    }

    const prevTier = String(prev.tier || "").trim();
    const currentTier = String(current.tier || "").trim();
    if (prevTier && currentTier && prevTier !== currentTier) {
      const override = resolveManualOverrideForPlayer(current, manualOverrideLookup);
      const overrideTier = shouldApplyManualTierOverride(override) ? normalizeName(override && override.tier) : "";
      if (overrideTier && overrideTier === currentTier) {
        continue;
      }
      tierChanges.push({
        player_name: current.display_name || current.name,
        team_name: normalizeTeamName(current.team_name),
        old_tier: prevTier,
        new_tier: currentTier,
      });
    }

    const prevTeam = normalizeTeamName(prev.team_name);
    const currentTeam = normalizeTeamName(current.team_name);
    if (prevTeam !== currentTeam) {
      const playerKey = buildPlayerKey(current, identityLookup);
      affiliationChanges.push({
        player_name: current.display_name || current.name,
        old_team: prevTeam,
        new_team: currentTeam,
        change_confidence: affiliationConfidenceLookup.get(playerKey) || "inferred",
      });
    }
  }

  for (const [key, prev] of beforeMap.entries()) {
    if (afterMap.has(key)) continue;
    removals.push({
      player_name: prev.display_name || prev.name,
      team_name: normalizeTeamName(prev.team_name),
    });
  }

  tierChanges.sort(compareTierChangeRows);
  affiliationChanges.sort(compareAffiliationChangeRows);
  joiners.sort(compareRosterPresenceRows);
  removals.sort(compareRosterPresenceRows);

  return { tierChanges, affiliationChanges, joiners, removals };
}

function isUnknownTierValue(value) {
  const normalized = String(value || "").trim().toLowerCase();
  return !normalized || normalized === "미정" || normalized === "unknown" || normalized === "?";
}

function isFreeAgentTeamName(value) {
  const normalized = String(value || "").trim().toLowerCase();
  return !normalized || normalized === "무소속" || normalized === "fa";
}

function compareKoreanText(a, b) {
  return String(a || "").localeCompare(String(b || ""), "ko");
}

function compareTierChangeRows(a, b) {
  const aPriority =
    (isUnknownTierValue(a.old_tier) && !isUnknownTierValue(a.new_tier) ? 0 : 1) +
    (isFreeAgentTeamName(a.team_name) ? 1 : 0);
  const bPriority =
    (isUnknownTierValue(b.old_tier) && !isUnknownTierValue(b.new_tier) ? 0 : 1) +
    (isFreeAgentTeamName(b.team_name) ? 1 : 0);
  if (aPriority !== bPriority) return aPriority - bPriority;
  const teamCompare = compareKoreanText(a.team_name, b.team_name);
  if (teamCompare !== 0) return teamCompare;
  return compareKoreanText(a.player_name, b.player_name);
}

function compareAffiliationChangeRows(a, b) {
  const aOldFree = isFreeAgentTeamName(a.old_team);
  const aNewFree = isFreeAgentTeamName(a.new_team);
  const bOldFree = isFreeAgentTeamName(b.old_team);
  const bNewFree = isFreeAgentTeamName(b.new_team);
  const aPriority = aOldFree !== aNewFree ? 0 : (aNewFree ? 2 : 1);
  const bPriority = bOldFree !== bNewFree ? 0 : (bNewFree ? 2 : 1);
  if (aPriority !== bPriority) return aPriority - bPriority;
  const nextTeamCompare = compareKoreanText(a.new_team, b.new_team);
  if (nextTeamCompare !== 0) return nextTeamCompare;
  return compareKoreanText(a.player_name, b.player_name);
}

function compareRosterPresenceRows(a, b) {
  const aPriority = isFreeAgentTeamName(a.team_name) ? 1 : 0;
  const bPriority = isFreeAgentTeamName(b.team_name) ? 1 : 0;
  if (aPriority !== bPriority) return aPriority - bPriority;
  const teamCompare = compareKoreanText(a.team_name, b.team_name);
  if (teamCompare !== 0) return teamCompare;
  return compareKoreanText(a.player_name, b.player_name);
}

function partitionAffiliationChanges(rows) {
  const primary = [];
  const fallback = [];

  for (const row of Array.isArray(rows) ? rows : []) {
    const confidence = String(row && row.change_confidence ? row.change_confidence : "inferred").trim().toLowerCase();
    if (confidence === "fallback") {
      fallback.push(row);
    } else {
      primary.push(row);
    }
  }

  return { primary, fallback };
}

function dateLabelFromSnapshot(snapshot) {
  const generatedAt = String(snapshot && snapshot.generated_at ? snapshot.generated_at : "").trim();
  if (generatedAt) {
    const dt = new Date(generatedAt);
    if (!Number.isNaN(dt.getTime())) {
      return new Intl.DateTimeFormat("sv-SE", {
        timeZone: "Asia/Seoul",
        year: "numeric",
        month: "2-digit",
        day: "2-digit",
      }).format(dt);
    }
  }
  const dateTag = String(snapshot && snapshot.period_to ? snapshot.period_to : "").trim();
  if (dateTag) return dateTag;
  return new Date().toISOString().slice(0, 10);
}

function dateLabelFromManualRefreshReport(report) {
  const generatedAt = String(report && report.generated_at ? report.generated_at : "").trim();
  if (!generatedAt) return null;
  const dt = new Date(generatedAt);
  if (Number.isNaN(dt.getTime())) return null;
  return new Intl.DateTimeFormat("sv-SE", {
    timeZone: "Asia/Seoul",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(dt);
}

function failureTailLine(report) {
  const failureStep = report && report.failure_step && typeof report.failure_step === "object"
    ? report.failure_step
    : null;
  if (!failureStep) return "";
  const stderrTail = Array.isArray(failureStep.stderr_tail) ? failureStep.stderr_tail : [];
  const stdoutTail = Array.isArray(failureStep.stdout_tail) ? failureStep.stdout_tail : [];
  const source = stderrTail.length ? stderrTail : stdoutTail;
  if (!source.length) return "";
  return String(source[source.length - 1] || "").trim();
}

function blockingAlertsSummary(alertsDoc, limit = 3) {
  const alerts = Array.isArray(alertsDoc && alertsDoc.alerts) ? alertsDoc.alerts : [];
  const blocking = new Set(
    Array.isArray(alertsDoc && alertsDoc.blocking_severities) && alertsDoc.blocking_severities.length
      ? alertsDoc.blocking_severities.map((value) => String(value))
      : ["critical", "high"]
  );
  const rows = alerts.filter((alert) => blocking.has(String(alert && alert.severity ? alert.severity : "")));
  return {
    total: rows.length,
    rows: rows.slice(0, limit).map((alert) => ({
      severity: String(alert && alert.severity ? alert.severity : ""),
      team: String(alert && alert.team ? alert.team : alert && alert.team_code ? alert.team_code : ""),
      rule: String(alert && alert.rule ? alert.rule : ""),
      message: String(alert && alert.message ? alert.message : ""),
    })),
  };
}

function describeFailureStage(report, opsPipelineReport) {
  const failureStepName =
    report && report.failure_step && typeof report.failure_step === "object"
      ? String(report.failure_step.name || "").trim()
      : "";
  const opsFailureStepName =
    opsPipelineReport && opsPipelineReport.failure_step && typeof opsPipelineReport.failure_step === "object"
      ? String(opsPipelineReport.failure_step.name || "").trim()
      : "";

  if (failureStepName === "collect_chunked") {
    return {
      headline: "\uC218\uC9D1 \uB2E8\uACC4\uC5D0\uC11C \uC624\uB958\uAC00 \uBC1C\uC0DD\uD588\uC2B5\uB2C8\uB2E4.",
      detail: "",
    };
  }

  if (failureStepName === "supabase_push") {
    return {
      headline: "\uBC18\uC601 \uB2E8\uACC4\uC5D0\uC11C \uC624\uB958\uAC00 \uBC1C\uC0DD\uD588\uC2B5\uB2C8\uB2E4.",
      detail: "",
    };
  }

  if (failureStepName) {
    return {
      headline: `\uD30C\uC774\uD504\uB77C\uC778 \uB2E8\uACC4(${failureStepName})\uC5D0\uC11C \uC624\uB958\uAC00 \uBC1C\uC0DD\uD588\uC2B5\uB2C8\uB2E4.`,
      detail: "",
    };
  }

  if (opsFailureStepName === "Run daily pipeline regression tests") {
    return {
      headline: "\uC0AC\uC804 \uAC80\uC99D \uB2E8\uACC4(\uD68C\uADC0 \uD14C\uC2A4\uD2B8)\uC5D0\uC11C \uC624\uB958\uAC00 \uBC1C\uC0DD\uD588\uC2B5\uB2C8\uB2E4.",
      detail: "\uC77C\uC77C \uC218\uC9D1\uC740 \uC2DC\uC791\uB418\uAE30 \uC804\uC5D0 \uC911\uB2E8\uB418\uC5C8\uC2B5\uB2C8\uB2E4.",
    };
  }

  if (opsFailureStepName) {
    return {
      headline: `\uC6CC\uD06C\uD50C\uB85C \uB2E8\uACC4(${opsFailureStepName})\uC5D0\uC11C \uC624\uB958\uAC00 \uBC1C\uC0DD\uD588\uC2B5\uB2C8\uB2E4.`,
      detail: "\uC77C\uC77C \uB9AC\uD3EC\uD2B8 \uD30C\uC77C\uC774 \uC5C6\uC5B4 \uC138\uBD80 \uC9D1\uACC4\uB294 \uC0DD\uB7B5\uD588\uC2B5\uB2C8\uB2E4.",
    };
  }

  return {
    headline: "\uC77C\uC77C \uB9AC\uD3EC\uD2B8 \uC0DD\uC131 \uC804 \uC624\uB958\uAC00 \uBC1C\uC0DD\uD588\uC2B5\uB2C8\uB2E4.",
    detail: "\uC218\uC9D1/\uBC18\uC601 \uB2E8\uACC4 \uC5EC\uBD80\uB294 \uCD94\uAC00 \uD655\uC778\uC774 \uD544\uC694\uD569\uB2C8\uB2E4.",
  };
}

function applyFailureStageToMessage(message, report, opsPipelineReport) {
  const failureStage = describeFailureStage(report, opsPipelineReport);
  const lines = String(message || "").split("\n");
  if (lines.length >= 3) {
    lines[2] = failureStage.headline;
  } else {
    lines.push(failureStage.headline);
  }
  if (failureStage.detail) {
    lines.splice(Math.min(3, lines.length), 0, failureStage.detail);
  }
  return lines.join("\n");
}

function workflowSyncWarning() {
  const warning = String(process.env.WORKFLOW_SYNC_WARNING || "").trim();
  if (warning) return warning;

  const report = readJsonIfExists(MANUAL_REFRESH_REPORT_PATH);
  const syncDetails =
    report && report.supabase_sync && typeof report.supabase_sync === "object"
      ? report.supabase_sync
      : null;
  if (!syncDetails || String(syncDetails.status || "").trim() !== "skipped") {
    const cache =
      syncDetails && syncDetails.cache_revalidation && typeof syncDetails.cache_revalidation === "object"
        ? syncDetails.cache_revalidation
        : null;
    if (!cache) return "";
    const cacheStatus = String(cache.status || "").trim();
    const cacheReason = String(cache.reason || "").trim();
    if (!cacheStatus || cacheStatus === "completed") return "";
    return cacheReason
      ? `Cache revalidation ${cacheStatus}: ${cacheReason}`
      : `Cache revalidation ${cacheStatus}`;
    return "";
  }

  const reason = String(syncDetails.skip_reason || "").trim();
  const blockingTotal = Number(syncDetails.blocking_alerts_total || 0);
  if (reason === "blocking_alerts_present") {
    return blockingTotal > 0
      ? `Supabase sync skipped because blocking alerts are present (${blockingTotal}).`
      : "Supabase sync skipped because blocking alerts are present.";
  }
  if (reason === "missing_latest_alert_report") {
    return "Supabase sync skipped because the latest alert report was missing.";
  }

  return reason ? `Supabase sync skipped: ${reason}` : "";
}

const OVERRIDE_WATCH_STATE_PATH = path.join(REPORTS_DIR, "roster_override_watch_state.json");
const OVERRIDE_FIELD_LABELS = { team_code: "소속", tier: "티어", race: "종족" };
const SYNC_REPORT_FRESHNESS_MS = 12 * 60 * 60 * 1000;

function mismatchStateKey(row) {
  const fields = Array.isArray(row && row.fields) ? row.fields : [];
  return `${row.entity_id}|${row.reason}|${fields
    .map((f) => `${f.field}:${f.manual}>${f.observed == null ? "" : f.observed}`)
    .join(",")}`;
}

function loadTemporaryOverrideWatch() {
  const syncReport = readJsonIfExists(path.join(REPORTS_DIR, "team_roster_sync_report.json"));
  const generatedAtMs = Date.parse(String(syncReport && syncReport.generated_at ? syncReport.generated_at : ""));
  const isFresh = Number.isFinite(generatedAtMs) && Date.now() - generatedAtMs < SYNC_REPORT_FRESHNESS_MS;
  const releases = isFresh && Array.isArray(syncReport.temporary_override_releases)
    ? syncReport.temporary_override_releases
    : [];
  const mismatches = isFresh && Array.isArray(syncReport.temporary_override_mismatches)
    ? syncReport.temporary_override_mismatches
    : [];
  const state = readJsonIfExists(OVERRIDE_WATCH_STATE_PATH) || {};
  const previouslyReported = new Set(
    Array.isArray(state.reported_mismatch_keys) ? state.reported_mismatch_keys : []
  );
  return {
    releases,
    newMismatches: mismatches.filter((row) => !previouslyReported.has(mismatchStateKey(row))),
    totalMismatches: mismatches.length,
    saveState() {
      if (!isFresh) return;
      try {
        fs.writeFileSync(
          OVERRIDE_WATCH_STATE_PATH,
          JSON.stringify({ reported_mismatch_keys: mismatches.map(mismatchStateKey) }, null, 2)
        );
      } catch {}
    },
  };
}

function formatOverrideReleaseRow(row) {
  const values = [
    row.team_code ? `소속 ${row.team_code}` : "",
    row.tier ? `티어 ${row.tier}` : "",
    row.race ? `종족 ${row.race}` : "",
  ]
    .filter(Boolean)
    .join(" · ");
  const persistNote = row.persisted ? "" : " (기록 실패 — 다음 실행 때 재시도)";
  return `- ${row.name} : ${values} — 엘로보드와 일치, 자동 해제${persistNote}`;
}

function formatOverrideMismatchRow(row) {
  if (row.reason === "not_on_eloboard") {
    return `- ${row.name} : 엘로보드에서 확인 불가 (수동 설정 유지 중)`;
  }
  const diffs = (Array.isArray(row.fields) ? row.fields : [])
    .map((f) => `${OVERRIDE_FIELD_LABELS[f.field] || f.field}: 내 설정 ${f.manual} / 엘로보드 ${f.observed || "-"}`)
    .join(", ");
  return `- ${row.name} : ${diffs}`;
}

function buildFailureMessage({ snapshot, runUrl, alertsDoc, opsPipelineReport }) {
  const report = readJsonIfExists(MANUAL_REFRESH_REPORT_PATH);
  const collectionHealth = readJsonIfExists(COLLECTION_SOURCES_HEALTH_PATH);
  const dateLabel = dateLabelFromManualRefreshReport(report) || dateLabelFromSnapshot(snapshot);
  const opsFailureStep =
    opsPipelineReport && opsPipelineReport.failure_step && typeof opsPipelineReport.failure_step === "object"
      ? opsPipelineReport.failure_step
      : null;
  const blockingSummary = blockingAlertsSummary(alertsDoc);
  const lines = [
    `산박대표님.일일 업데이트보고입니다. 실패 (${dateLabel})`,
    "",
    "수집 또는 반영 단계에서 오류가 발생했습니다.",
  ];
  const syncModeLabel = supabaseSyncModeLabel();
  if (syncModeLabel) {
    lines.push(syncModeLabel);
  }
  const syncWarning = workflowSyncWarning();
  if (syncWarning) {
    lines.push(`동기화 안내: ${syncWarning}`);
  }
  const collectionHealthSummary = buildCollectionSourceHealthSummary(collectionHealth);
  if (collectionHealthSummary) {
    lines.push(collectionHealthSummary);
  }
  if (report && report.failure_step && report.failure_step.name) {
    lines.push(`실패 단계: ${report.failure_step.name}`);
  }
  if (report && report.error) {
    lines.push(`오류 요약: ${String(report.error).trim()}`);
  }
  const tail = failureTailLine(report);
  if (tail) {
    lines.push(`마지막 로그: ${tail}`);
  }
  if (opsFailureStep && opsFailureStep.name) {
    lines.push(`내부 실패 단계: ${opsFailureStep.name}`);
  }
  if (blockingSummary.total > 0) {
    lines.push(
      `Blocking alerts: ${blockingSummary.total}건${
        alertsDoc && alertsDoc.counts
          ? ` (critical ${Number(alertsDoc.counts.critical || 0)}, high ${Number(alertsDoc.counts.high || 0)})`
          : ""
      }`
    );
    for (const item of blockingSummary.rows) {
      lines.push(`- [${item.severity}] ${item.team} / ${item.rule} / ${item.message}`);
    }
  }
  if (runUrl) {
    lines.push("");
    lines.push(`실행 링크: ${runUrl}`);
  }
  return lines.join("\n");
}

function describeAlertTone(alertCounts) {
  const counts = alertCounts || {};
  const critical = Number(counts.critical || 0);
  const high = Number(counts.high || 0);
  const medium = Number(counts.medium || 0);
  const low = Number(counts.low || 0);
  const total = Number(counts.total || 0);
  if (critical > 0 || high > 0) {
    return {
      headlineSuffix: "(경고 포함)",
      summaryLabel: "주의 알림",
      followup: "경고가 있었으므로 세부 항목을 확인해야 합니다.",
      isWarning: true,
    };
  }
  if (medium > 0 || low > 0 || total > 0) {
    return {
      headlineSuffix: "(변동 알림)",
      summaryLabel: "변동 알림",
      followup: "전적데이터 반영은 정상 완료되었고, 선수 기준데이터 후보는 운영상 검토용입니다.",
      isWarning: false,
    };
  }
  return {
    headlineSuffix: "",
    summaryLabel: "알림",
    followup: "",
    isWarning: false,
  };
}

function supabaseSyncModeLabel() {
  const workflowModeLabel = String(process.env.WORKFLOW_MODE_LABEL || "").trim();
  if (workflowModeLabel) {
    return workflowModeLabel.startsWith("실행 모드:")
      ? workflowModeLabel
      : `실행 모드: ${workflowModeLabel}`;
  }

  const report = readJsonIfExists(MANUAL_REFRESH_REPORT_PATH);
  const syncDetails =
    report && report.supabase_sync && typeof report.supabase_sync === "object"
      ? report.supabase_sync
      : null;

  if (syncDetails) {
    const status = String(syncDetails.status || "").trim();
    if (status === "completed") {
      const cache =
        syncDetails.cache_revalidation && typeof syncDetails.cache_revalidation === "object"
          ? syncDetails.cache_revalidation
          : null;
      if (!cache || String(cache.status || "").trim() === "completed") {
        return "실행 모드: Supabase sync completed";
      }
      const cacheStatus = String(cache.status || "").trim() || "unknown";
      return `실행 모드: Supabase sync completed (cache revalidation: ${cacheStatus})`;
    }
    if (status === "skipped") return "실행 모드: Supabase sync skipped";
    if (status === "disabled") return "실행 모드: Collect-only (Supabase sync not requested)";
  }

  if (report && typeof report.with_supabase_sync === "boolean") {
    return report.with_supabase_sync
      ? "실행 모드: Supabase sync requested"
      : "실행 모드: Collect-only (Supabase sync skipped)";
  }

  return "";
}

function collectionHealthCheckLabel(id) {
  const labels = {
    team_index: "팀 인덱스",
    team_roster_page: "팀 로스터",
    player_profile_page: "선수 프로필",
    player_paginated_history: "경기 내역",
  };
  return labels[id] || String(id || "").trim();
}

function buildCollectionSourceHealthSummary(doc) {
  if (!doc || typeof doc !== "object") return "";
  const checks = doc.checks && typeof doc.checks === "object" ? doc.checks : {};
  const entries = Object.entries(checks);
  if (!entries.length) return "";

  const failed = entries.filter(([, check]) => check && !check.ok && !check.skipped);
  if (!failed.length) {
    return "수집 경로 확인: 정상";
  }

  const names = failed.map(([id]) => collectionHealthCheckLabel(id));
  return `수집 경로 확인: ${names.join(", ")} 확인 필요`;
}

function pushLimitedRows(lines, rows, formatter, limit = 5) {
  const list = Array.isArray(rows) ? rows : [];
  for (const row of list.slice(0, limit)) {
    lines.push(formatter(row));
  }
  if (list.length > limit) {
    lines.push(`- 외 ${list.length - limit}건`);
  }
}

function isRosterSyncReportOnly() {
  const syncReport = readJsonIfExists(path.join(REPORTS_DIR, "team_roster_sync_report.json"));
  return Boolean(syncReport && syncReport.report_only);
}

// §6: 아침 보고는 "파이프라인 성공/실패"와 "사람이 판단할 것"만 담는다.
// 매일 비슷한 팀별 수치를 나열하면 정작 중요한 항목이 묻힌다.
const JUDGMENT_ALERT_RULES = {
  zero_record_players: "근거 없는 0건",
  roster_player_excluded_by_opponent_name: "이름 겹침",
  rotation_verify_mismatch: "순환 검증 mismatch",
};

// medium인 roster_size_changed·roster_transition_detected 같은 "매일 뜨는" 항목은 여기서 걸러진다.
function isJudgmentAlert(alert) {
  const rule = String(alert && alert.rule ? alert.rule : "");
  const severity = String(alert && alert.severity ? alert.severity : "");
  return Boolean(JUDGMENT_ALERT_RULES[rule]) || severity === "critical" || severity === "high";
}

function limitedLines(rows, formatter) {
  const lines = [];
  pushLimitedRows(lines, rows, formatter);
  return lines;
}

// 새로 수집하지 않는다. 이미 만들어진 산출물만 읽어 "사람이 볼 것"으로 추린다.
function buildJudgmentItems({ alertsDoc, overrideWatch, rosterReview, syncWarning, collectionHealthSummary } = {}) {
  const items = [];

  // §4: 수집은 완주했는데 서빙 반영만 보류된 날은 사람이 봐야 한다.
  const warning = String(syncWarning || "").trim();
  if (warning) {
    items.push({ label: "서빙 반영 보류", lines: [`- ${warning}`], count: 1 });
  }

  const newMismatches = Array.isArray(overrideWatch && overrideWatch.newMismatches)
    ? overrideWatch.newMismatches
    : [];
  if (newMismatches.length) {
    const totalMismatches = Number(
      overrideWatch && overrideWatch.totalMismatches ? overrideWatch.totalMismatches : newMismatches.length
    );
    items.push({
      label: `임시 교정 확인 필요 (신규 ${newMismatches.length}건 / 전체 ${totalMismatches}건)`,
      lines: limitedLines(newMismatches, formatOverrideMismatchRow),
      count: newMismatches.length,
    });
  }

  const releases = Array.isArray(overrideWatch && overrideWatch.releases) ? overrideWatch.releases : [];
  if (releases.length) {
    items.push({
      label: `임시 교정 자동 해제 ${releases.length}건`,
      lines: limitedLines(releases, formatOverrideReleaseRow),
      count: releases.length,
    });
  }

  const rosterReviewTotal = Number(rosterReview && rosterReview.total ? rosterReview.total : 0);
  if (rosterReview && rosterReview.reportOnly && rosterReviewTotal > 0) {
    items.push({
      label: `선수 대장 검토 대기 ${rosterReviewTotal}건`,
      lines: ["- 관리자 검토: /admin/roster/ops-review"],
      count: rosterReviewTotal,
    });
  }

  const alertsByRule = new Map();
  for (const alert of Array.isArray(alertsDoc && alertsDoc.alerts) ? alertsDoc.alerts : []) {
    if (!isJudgmentAlert(alert)) continue;
    const rule = String(alert && alert.rule ? alert.rule : "");
    if (!alertsByRule.has(rule)) alertsByRule.set(rule, []);
    alertsByRule.get(rule).push(alert);
  }
  for (const [rule, rows] of alertsByRule.entries()) {
    items.push({
      label: `${JUDGMENT_ALERT_RULES[rule] || rule} (${rows.length}건)`,
      lines: limitedLines(rows, (alert) =>
        `- [${alert.severity || ""}] ${alert.team || alert.team_code || ""} ${alert.message || ""}`.trimEnd()
      ),
      count: rows.length,
    });
  }

  // 수집 경로가 정상인 날은 아무 말도 하지 않는다. 실패한 날만 판단 항목이다.
  const collectionWarning = String(collectionHealthSummary || "").trim();
  if (collectionWarning.includes("확인 필요")) {
    items.push({ label: "수집 경로 확인 필요", lines: [`- ${collectionWarning}`], count: 1 });
  }

  return items;
}

function buildDailyReportMessage({ dateLabel, judgmentItems, runUrl } = {}) {
  const items = Array.isArray(judgmentItems) ? judgmentItems : [];
  const link = String(runUrl || "").trim();

  // 조용한 날에도 한 줄은 보낸다. "잘 돌고 있다"를 확인할 방법이 이것뿐이다.
  if (!items.length) {
    return `✅ 파이프라인 정상 (${dateLabel}) · 판단할 것 없음${link ? ` · <${link}>` : ""}`;
  }

  const total = items.reduce((acc, item) => acc + (Number(item && item.count) || 0), 0);
  const lines = [`✅ 파이프라인 정상 (${dateLabel}) — 판단할 것 ${total}건`, ""];
  for (const item of items) {
    lines.push(`■ ${item.label}`);
    lines.push(...(Array.isArray(item.lines) ? item.lines : []));
    lines.push("");
  }
  if (link) lines.push(`상세: <${link}>`);

  return lines.join("\n").replace(/\n{3,}/g, "\n\n").trim();
}

function buildReadableSuccessMessage({ snapshot, alertsDoc, runUrl, supabasePlayerMap }) {
  const previousRosterStatePlayers = loadCurrentRosterStateSnapshot(REPORTS_DIR);
  const beforePlayers = previousRosterStatePlayers.length
    ? previousRosterStatePlayers
    : loadBaselinePlayers(BASELINE_PATH);
  const afterPlayers = loadCurrentRosterState(PROJECTS_DIR);
  const { tierChanges, affiliationChanges, joiners, removals } = comparePlayerChanges(beforePlayers, afterPlayers);
  const summaryCheck = buildDiscordSummaryCheck({
    reportsDir: REPORTS_DIR,
    baselinePath: BASELINE_PATH,
    projectsDir: PROJECTS_DIR,
    snapshot,
    alertsDoc,
    currentPlayers: afterPlayers,
    previousRosterStatePlayers,
    supabasePlayerMap,
  });
  // 메시지에 쓰지 않더라도 남긴다. 이 스냅샷이 다음 실행의 비교 기준이다.
  writeCurrentRosterStateSnapshot(REPORTS_DIR, afterPlayers);

  const joinersForMessage = Array.isArray(summaryCheck.joiners) && summaryCheck.joiners.length
    ? summaryCheck.joiners
    : joiners;
  const affiliationChangesForMessage =
    Array.isArray(summaryCheck.affiliation_changes) && summaryCheck.affiliation_changes.length
      ? summaryCheck.affiliation_changes
      : affiliationChanges;

  const overrideWatch = loadTemporaryOverrideWatch();
  const judgmentItems = buildJudgmentItems({
    alertsDoc,
    overrideWatch,
    rosterReview: {
      reportOnly: isRosterSyncReportOnly(),
      total:
        tierChanges.length + affiliationChangesForMessage.length + joinersForMessage.length + removals.length,
    },
    syncWarning: workflowSyncWarning(),
    collectionHealthSummary: buildCollectionSourceHealthSummary(readJsonIfExists(COLLECTION_SOURCES_HEALTH_PATH)),
  });
  // 저장하지 않으면 같은 mismatch가 매일 다시 뜬다.
  overrideWatch.saveState();

  return buildDailyReportMessage({
    dateLabel: dateLabelFromSnapshot(snapshot),
    judgmentItems,
    runUrl,
  });
}

function buildMessage({ outcome, source, runUrl, supabasePlayerMap }) {
  const snapshotPath = resolveLatestReportFile(REPORTS_DIR, "daily_pipeline_snapshot_");
  const alertsPath = resolveLatestReportFile(REPORTS_DIR, "daily_pipeline_alerts_");
  const snapshot = readJsonIfExists(snapshotPath);
  const alertsDoc = readJsonIfExists(alertsPath);
  const report = readJsonIfExists(MANUAL_REFRESH_REPORT_PATH);
  const opsPipelineReport = readJsonIfExists(OPS_PIPELINE_REPORT_PATH);
  if (outcome !== "success") {
    return applyFailureStageToMessage(
      buildFailureMessage({ snapshot, runUrl, alertsDoc, opsPipelineReport, source }),
      report,
      opsPipelineReport
    );
  }
  return buildReadableSuccessMessage({ snapshot, alertsDoc, runUrl, source, supabasePlayerMap });
}

async function postDiscordWebhook(content) {
  const webhook =
    process.env.OPS_DISCORD_WEBHOOK_URL ||
    process.env.DISCORD_WEBHOOK_URL ||
    "";
  if (!String(webhook).trim()) {
    console.log("Discord 웹훅이 없어 알림을 건너뜁니다.");
    return;
  }

  const res = await fetch(webhook, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ content }),
  });

  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new Error(`Discord 웹훅 전송 실패: ${res.status} ${body}`);
  }
}

async function main() {
  const outcome = String(argValue("--outcome", "success")).trim().toLowerCase();
  const source = String(argValue("--source", "manual-refresh")).trim();
  const runUrl = String(argValue("--run-url", "")).trim();
  const noSend = hasFlag("--no-send");

  let supabasePlayerMap = null;
  if (outcome === "success") {
    try {
      const { fetchSupabasePlayerMap } = require("./lib/supabase-roster-state");
      supabasePlayerMap = await fetchSupabasePlayerMap();
    } catch {}
  }

  const message = buildMessage({ outcome, source, runUrl, supabasePlayerMap });
  if (!noSend) {
    await postDiscordWebhook(message);
  }
  console.log(message);
}

if (require.main === module) {
  main().catch((error) => {
    console.error(error instanceof Error ? error.message : String(error));
    process.exit(1);
  });
}

module.exports = {
  buildAffiliationConfidenceLookup,
  applyFailureStageToMessage,
  buildCollectionSourceHealthSummary,
  buildDailyReportMessage,
  buildFailureMessage,
  buildJudgmentItems,
  describeFailureStage,
  buildReadableSuccessMessage,
  comparePlayerChanges,
  describeAlertTone,
  formatAffiliationChangeRow,
  partitionAffiliationChanges,
};
