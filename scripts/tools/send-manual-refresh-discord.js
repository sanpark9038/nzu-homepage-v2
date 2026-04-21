const fs = require("fs");
const path = require("path");
require("dotenv").config({ path: path.join(__dirname, "..", "..", ".env.local") });
const {
  buildDiscordSummaryCheck,
  buildPlayerKey,
  mergedEntityIdLookup,
  loadBaselinePlayers,
  loadCurrentRosterState,
  normalizeTeamName,
  readJsonIfExists,
  resolveLatestReportFile,
  writeCurrentRosterStateSnapshot,
} = require("./lib/discord-summary");

const ROOT = path.resolve(__dirname, "..", "..");
const REPORTS_DIR = path.join(ROOT, "tmp", "reports");
const PROJECTS_DIR = path.join(ROOT, "data", "metadata", "projects");
const MANUAL_OVERRIDES_PATH = path.join(ROOT, "data", "metadata", "roster_manual_overrides.v1.json");
const BASELINE_PATH = path.join(REPORTS_DIR, "manual_refresh_baseline.json");
const MANUAL_REFRESH_REPORT_PATH = path.join(REPORTS_DIR, "manual_refresh_latest.json");
const OPS_PIPELINE_REPORT_PATH = path.join(REPORTS_DIR, "ops_pipeline_latest.json");
const COLLECTION_SOURCES_HEALTH_PATH = path.join(REPORTS_DIR, "pipeline_collection_sources_health_latest.json");
const TMP_DIR = path.join(ROOT, "tmp");

function argValue(flag, fallback = null) {
  const idx = process.argv.indexOf(flag);
  if (idx >= 0 && process.argv[idx + 1]) return process.argv[idx + 1];
  return fallback;
}

function hasFlag(flag) {
  return process.argv.includes(flag);
}

function sumBy(rows, key) {
  return rows.reduce((acc, row) => acc + (Number(row && row[key] ? row[key] : 0) || 0), 0);
}

function todayInSeoul() {
  return new Intl.DateTimeFormat("sv-SE", {
    timeZone: "Asia/Seoul",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());
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

function safeFileName(name) {
  return String(name || "").replace(/[<>:"/\\|?*\x00-\x1F]/g, "_");
}

function playerArtifactKey(player) {
  const entityId = normalizeEntityId(player && player.entity_id);
  if (entityId) return entityId.replace(/[<>:"/\\|?*\x00-\x1F]/g, "_");
  const wrId = Number(player && player.wr_id ? player.wr_id : 0);
  const gender = String(player && player.gender ? player.gender : "").trim() || "unknown";
  if (Number.isFinite(wrId) && wrId > 0) return `wr_${gender}_${wrId}`;
  return safeFileName(String(player && player.name ? player.name : "unknown_player"));
}

function loadManualOverrides() {
  const doc = readJsonIfExists(MANUAL_OVERRIDES_PATH);
  return Array.isArray(doc && doc.overrides) ? doc.overrides : [];
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
      const overrideTier = normalizeName(override && override.tier);
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

function matchFilePathForPlayer(player) {
  const teamName = String(player && player.team_name ? player.team_name : "").trim();
  const playerName = String(player && player.name ? player.name : "").trim();
  if (!teamName || !playerName) return null;
  const candidates = [
    path.join(TMP_DIR, `${teamName}_${playerArtifactKey(player)}_matches.json`),
    path.join(TMP_DIR, `${teamName}_${safeFileName(playerName)}_matches.json`),
  ];
  return candidates.find((filePath) => fs.existsSync(filePath)) || candidates[0];
}

function countTodayMatchesForPlayer(player, targetDate) {
  const filePath = matchFilePathForPlayer(player);
  if (!filePath || !fs.existsSync(filePath)) return 0;
  const doc = readJsonIfExists(filePath);
  const rows =
    Array.isArray(doc && doc.players) && doc.players[0] && Array.isArray(doc.players[0].matches)
      ? doc.players[0].matches
      : [];
  return rows.reduce((acc, row) => {
    return String(row && row.date ? row.date : "").trim() === targetDate ? acc + 1 : acc;
  }, 0);
}

function buildTodayTopPlayers(afterPlayers) {
  const targetDate = todayInSeoul();
  const rows = afterPlayers
    .map((player) => ({
      player_name: player.display_name || player.name,
      team_name: normalizeTeamName(player.team_name),
      today_matches: countTodayMatchesForPlayer(player, targetDate),
    }))
    .filter((row) => row.today_matches > 0)
    .sort((a, b) => {
      if (a.today_matches !== b.today_matches) return b.today_matches - a.today_matches;
      return String(a.player_name).localeCompare(String(b.player_name), "ko");
    });

  return {
    targetDate,
    players: rows.slice(0, 5),
  };
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

function countAlertsBySeverity(alerts) {
  return {
    critical: alerts.filter((a) => a.severity === "critical").length,
    high: alerts.filter((a) => a.severity === "high").length,
    medium: alerts.filter((a) => a.severity === "medium").length,
    low: alerts.filter((a) => a.severity === "low").length,
    total: alerts.length,
  };
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
      followup: "반영은 정상 완료되었고, 아래 항목은 운영상 참고용입니다.",
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
    return workflowModeLabel.startsWith("?ㅽ뻾 紐⑤뱶:")
      ? workflowModeLabel
      : `?ㅽ뻾 紐⑤뱶: ${workflowModeLabel}`;
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
        return "Supabase sync completed";
      }
      const cacheStatus = String(cache.status || "").trim() || "unknown";
      return `Supabase sync completed (cache revalidation: ${cacheStatus})`;
    }
    if (status === "completed") return "?ㅽ뻾 紐⑤뱶: Supabase sync completed";
    if (status === "skipped") return "?ㅽ뻾 紐⑤뱶: Supabase sync skipped";
    if (status === "disabled") return "?ㅽ뻾 紐⑤뱶: Collect-only (Supabase sync not requested)";
  }

  if (report && typeof report.with_supabase_sync === "boolean") {
    return report.with_supabase_sync
      ? "?ㅽ뻾 紐⑤뱶: Supabase sync requested"
      : "?ㅽ뻾 紐⑤뱶: Collect-only (Supabase sync skipped)";
  }

  return "";
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

function collectionHealthCheckLabel(id) {
  const labels = {
    team_index: "팀 목록",
    team_roster_page: "팀 로스터",
    player_profile_page: "선수 프로필",
    player_paginated_history: "전적 페이지",
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
    lines.push(`- ì™¸ ${list.length - limit}ëª…`);
  }
}

function pushLimitedRows(lines, rows, formatter, limit = 5) {
  const list = Array.isArray(rows) ? rows : [];
  for (const row of list.slice(0, limit)) {
    lines.push(formatter(row));
  }
  if (list.length > limit) {
    lines.push(`- 외 ${list.length - limit}명`);
  }
}

function buildSuccessMessage({ snapshot, alertsDoc, runUrl }) {
  const beforePlayers = loadBaselinePlayers(BASELINE_PATH);
  const afterPlayers = loadCurrentRosterState(PROJECTS_DIR);
  const collectionHealth = readJsonIfExists(COLLECTION_SOURCES_HEALTH_PATH);
  writeCurrentRosterStateSnapshot(REPORTS_DIR, afterPlayers);
  const { tierChanges, affiliationChanges, joiners, removals } = comparePlayerChanges(beforePlayers, afterPlayers);
  const todayTop = buildTodayTopPlayers(afterPlayers);
  const summaryCheck = buildDiscordSummaryCheck({
    reportsDir: REPORTS_DIR,
    baselinePath: BASELINE_PATH,
    projectsDir: PROJECTS_DIR,
    snapshot,
    alertsDoc,
  });
  const alertCounts = summaryCheck.alerts.counts || countAlertsBySeverity([]);
  const alertTone = describeAlertTone(alertCounts);
  const deltaComparable = Boolean(
    snapshot &&
      snapshot.delta_reference &&
      snapshot.delta_reference.comparable
  );
  const newMatches = summaryCheck.new_matches_total;
  const joinersForMessage = Array.isArray(summaryCheck.joiners) && summaryCheck.joiners.length
    ? summaryCheck.joiners
    : joiners;
  const affiliationChangesForMessage =
    Array.isArray(summaryCheck.affiliation_changes) && summaryCheck.affiliation_changes.length
      ? summaryCheck.affiliation_changes
      : affiliationChanges;
  const partitionedAffiliationChanges = partitionAffiliationChanges(affiliationChangesForMessage);
  const fallbackAffiliationChanges = partitionedAffiliationChanges.fallback;
  affiliationChanges.length = 0;
  affiliationChanges.push(...partitionedAffiliationChanges.primary);

  const lines = [
    `산박대표님.일일 업데이트보고입니다. ${alertTone.headlineSuffix} (${dateLabelFromSnapshot(snapshot)})`.trim(),
    "",
  ];
  const syncModeLabel = supabaseSyncModeLabel();
  if (syncModeLabel) {
    lines.push(syncModeLabel);
    const syncWarning = workflowSyncWarning();
    if (syncWarning) {
      lines.push(`- ${syncWarning}`);
    }
    lines.push("");
  }
  const collectionHealthSummary = buildCollectionSourceHealthSummary(collectionHealth);
  if (collectionHealthSummary) {
    lines.push(collectionHealthSummary);
    lines.push("");
  }

  if (
    !tierChanges.length &&
    !affiliationChangesForMessage.length &&
    !joinersForMessage.length &&
    !removals.length &&
    (deltaComparable ? newMatches <= 0 : true) &&
    !todayTop.players.length
  ) {
    if (deltaComparable) {
      lines.push("오늘 변동사항 없음");
    } else {
      lines.push("오늘 선수 변동은 감지되지 않았습니다.");
      lines.push("직전 스냅샷 비교가 성립하지 않아 신규 전적 증감은 이번 알림에서 계산하지 못했습니다.");
    }
  } else {
    if (tierChanges.length) {
      lines.push("📊 티어 변동");
      pushLimitedRows(
        lines,
        tierChanges,
        (item) => `- ${item.player_name} (${item.team_name}) : ${item.old_tier} -> ${item.new_tier}`
      );
      lines.push("");
    }

    if (affiliationChanges.length) {
      lines.push("🏠 소속 변동");
      pushLimitedRows(
        lines,
        affiliationChanges,
        formatAffiliationChangeRow
      );
      lines.push("");
    }
    if (fallbackAffiliationChanges.length) {
      lines.push(`Fallback affiliation changes: ${fallbackAffiliationChanges.length}`);
      pushLimitedRows(
        lines,
        fallbackAffiliationChanges,
        formatAffiliationChangeRow
      );
      lines.push("");
    }

    if (joinersForMessage.length) {
      lines.push("🆕 로스터 신규 편입");
      pushLimitedRows(
        lines,
        joinersForMessage,
        (item) => `- ${item.player_name} (${item.team_name})`
      );
      lines.push("- 기준선 대비 이번 실행에서 새로 로스터에 포함된 선수입니다.");
      lines.push("");
    }

    if (removals.length) {
      lines.push("📤 로스터 제외");
      pushLimitedRows(
        lines,
        removals,
        (item) => `- ${item.player_name} (${item.team_name})`
      );
      lines.push("");
    }

    if (deltaComparable) {
      lines.push("🆕 신규 전적");
      lines.push(`- 직전 실행 대비 새로 반영된 경기: ${newMatches}건`);
    } else {
      lines.push("🆕 신규 전적");
      lines.push("- 직전 스냅샷 비교 불가");
    }

    if (todayTop.players.length) {
      lines.push("");
      lines.push(`🔥 오늘 경기 수 상위 선수 (${todayTop.targetDate})`);
      pushLimitedRows(
        lines,
        todayTop.players,
        (item) => `- ${item.player_name} (${item.team_name}) : ${item.today_matches}??`
      );
    }
  }

  if ((alertCounts.total || 0) > 0) {
    lines.push("");
    lines.push(
      `${alertTone.summaryLabel}: ${alertCounts.total}건 (critical ${alertCounts.critical}, high ${alertCounts.high}, medium ${alertCounts.medium}, low ${alertCounts.low})`
    );
    if (alertTone.followup) {
      lines.push(alertTone.followup);
    }
  }
  if (runUrl) {
    lines.push("");
    lines.push(`실행 링크: <${runUrl}>`);
  }

  return lines.join("\n").replace(/\n{3,}/g, "\n\n").trim();
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

function buildReadableSuccessMessage({ snapshot, alertsDoc, runUrl }) {
  const beforePlayers = loadBaselinePlayers(BASELINE_PATH);
  const afterPlayers = loadCurrentRosterState(PROJECTS_DIR);
  const collectionHealth = readJsonIfExists(COLLECTION_SOURCES_HEALTH_PATH);
  writeCurrentRosterStateSnapshot(REPORTS_DIR, afterPlayers);

  const { tierChanges, affiliationChanges, joiners, removals } = comparePlayerChanges(beforePlayers, afterPlayers);
  const todayTop = buildTodayTopPlayers(afterPlayers);
  const summaryCheck = buildDiscordSummaryCheck({
    reportsDir: REPORTS_DIR,
    baselinePath: BASELINE_PATH,
    projectsDir: PROJECTS_DIR,
    snapshot,
    alertsDoc,
  });

  const alertCounts = summaryCheck.alerts.counts || countAlertsBySeverity([]);
  const alertTone = describeAlertTone(alertCounts);
  const deltaComparable = Boolean(
    snapshot &&
      snapshot.delta_reference &&
      snapshot.delta_reference.comparable
  );
  const newMatches = summaryCheck.new_matches_total;
  const joinersForMessage = Array.isArray(summaryCheck.joiners) && summaryCheck.joiners.length
    ? summaryCheck.joiners
    : joiners;
  const affiliationChangesForMessage =
    Array.isArray(summaryCheck.affiliation_changes) && summaryCheck.affiliation_changes.length
      ? summaryCheck.affiliation_changes
      : affiliationChanges;
  const partitionedAffiliationChanges = partitionAffiliationChanges(affiliationChangesForMessage);
  const fallbackAffiliationChanges = partitionedAffiliationChanges.fallback;
  affiliationChanges.length = 0;
  affiliationChanges.push(...partitionedAffiliationChanges.primary);
  const hasPrimaryChanges =
    tierChanges.length ||
    affiliationChangesForMessage.length ||
    joinersForMessage.length ||
    removals.length ||
    (deltaComparable ? newMatches > 0 : false);

  const lines = [
    `산박대표님.일일 업데이트보고입니다. ${alertTone.headlineSuffix} (${dateLabelFromSnapshot(snapshot)})`.trim(),
    "",
  ];

  const syncModeLabel = supabaseSyncModeLabel();
  if (syncModeLabel) {
    lines.push(syncModeLabel);
    const syncWarning = workflowSyncWarning();
    if (syncWarning) {
      lines.push(`- ${syncWarning}`);
    }
    lines.push("");
  }

  const collectionHealthSummary = buildCollectionSourceHealthSummary(collectionHealth);
  if (collectionHealthSummary) {
    lines.push(collectionHealthSummary);
    lines.push("");
  }

  if (!hasPrimaryChanges && !todayTop.players.length) {
    lines.push("주요 변동 없음");
    if (!deltaComparable) {
      lines.push("이번 실행은 기준선 비교가 없어 신규 전적 증감은 판단하지 않았습니다.");
    }
  } else {
    if (tierChanges.length) {
      lines.push(`티어 변동: ${tierChanges.length}명`);
      pushLimitedRows(
        lines,
        tierChanges,
        (item) => `- ${item.player_name} (${item.team_name}) : ${item.old_tier} -> ${item.new_tier}`
      );
      lines.push("");
    }

    if (affiliationChanges.length) {
      lines.push(`소속 변동: ${affiliationChanges.length}명`);
      pushLimitedRows(
        lines,
        affiliationChanges,
        formatAffiliationChangeRow
      );
      lines.push("");
    }

    if (fallbackAffiliationChanges.length) {
      lines.push(`Fallback affiliation changes: ${fallbackAffiliationChanges.length}`);
      pushLimitedRows(
        lines,
        fallbackAffiliationChanges,
        formatAffiliationChangeRow
      );
      lines.push("");
    }

    if (joinersForMessage.length) {
      lines.push(`신규 편입: ${joinersForMessage.length}명`);
      pushLimitedRows(
        lines,
        joinersForMessage,
        (item) => `- ${item.player_name} (${item.team_name})`
      );
      lines.push("");
    }

    if (removals.length) {
      lines.push(`로스터 제외: ${removals.length}명`);
      pushLimitedRows(
        lines,
        removals,
        (item) => `- ${item.player_name} (${item.team_name})`
      );
      lines.push("");
    }

    lines.push("신규 전적");
    if (deltaComparable) {
      lines.push(`- 직전 실행 대비 새로 반영된 경기: ${newMatches}건`);
    } else {
      lines.push("- 이번 실행은 기준선 비교가 없어 신규 전적 증감은 판단하지 않았습니다.");
    }

    if (todayTop.players.length) {
      lines.push("");
      lines.push(`오늘 경기 많은 선수 (${todayTop.targetDate})`);
      pushLimitedRows(
        lines,
        todayTop.players,
        (item) => `- ${item.player_name} (${item.team_name}) : ${item.today_matches}??`
      );
    }
  }

  if ((alertCounts.total || 0) > 0) {
    lines.push("");
    lines.push(
      `변동 알림: ${alertCounts.total}건 (critical ${alertCounts.critical}, high ${alertCounts.high}, medium ${alertCounts.medium}, low ${alertCounts.low})`
    );
    lines.push("반영은 정상 완료되었고, 아래 항목은 운영상 참고용입니다.");
  }
  if (runUrl) {
    lines.push("");
    lines.push(`실행 링크: <${runUrl}>`);
  }

  return lines.join("\n").replace(/\n{3,}/g, "\n\n").trim();
}

function buildMessage({ outcome, source, runUrl }) {
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
  return buildReadableSuccessMessage({ snapshot, alertsDoc, runUrl, source });
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
  const message = buildMessage({ outcome, source, runUrl });
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
  describeFailureStage,
  buildReadableSuccessMessage,
  comparePlayerChanges,
  describeAlertTone,
  buildSuccessMessage,
  formatAffiliationChangeRow,
  partitionAffiliationChanges,
};
