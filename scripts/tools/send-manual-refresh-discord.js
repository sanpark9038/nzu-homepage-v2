const fs = require("fs");
const path = require("path");
require("dotenv").config({ path: path.join(__dirname, "..", "..", ".env.local") });
const {
  buildDiscordSummaryCheck,
  buildPlayerKey,
  loadBaselinePlayers,
  loadCurrentRosterState,
  normalizeTeamName,
  readJsonIfExists,
} = require("./lib/discord-summary");

const ROOT = path.resolve(__dirname, "..", "..");
const REPORTS_DIR = path.join(ROOT, "tmp", "reports");
const PROJECTS_DIR = path.join(ROOT, "data", "metadata", "projects");
const MANUAL_OVERRIDES_PATH = path.join(ROOT, "data", "metadata", "roster_manual_overrides.v1.json");
const BASELINE_PATH = path.join(REPORTS_DIR, "manual_refresh_baseline.json");
const MANUAL_REFRESH_REPORT_PATH = path.join(REPORTS_DIR, "manual_refresh_latest.json");
const OPS_PIPELINE_REPORT_PATH = path.join(REPORTS_DIR, "ops_pipeline_latest.json");
const TMP_DIR = path.join(ROOT, "tmp");

function argValue(flag, fallback = null) {
  const idx = process.argv.indexOf(flag);
  if (idx >= 0 && process.argv[idx + 1]) return process.argv[idx + 1];
  return fallback;
}

function hasFlag(flag) {
  return process.argv.includes(flag);
}

function latestFileByPrefix(prefix) {
  if (!fs.existsSync(REPORTS_DIR)) return null;
  const files = fs
    .readdirSync(REPORTS_DIR)
    .filter((n) => n.startsWith(prefix) && n.endsWith(".json"))
    .map((name) => {
      const full = path.join(REPORTS_DIR, name);
      return { full, name, mtime: fs.statSync(full).mtimeMs };
    })
    .sort((a, b) => b.mtime - a.mtime);
  return files.length ? files[0].full : null;
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

function toPlayerMap(players) {
  return new Map(players.map((player) => [buildPlayerKey(player), player]));
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

function comparePlayerChanges(beforePlayers, afterPlayers) {
  const beforeMap = toPlayerMap(beforePlayers);
  const afterMap = toPlayerMap(afterPlayers);
  const manualOverrideLookup = buildManualOverrideLookup();
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
      affiliationChanges.push({
        player_name: current.display_name || current.name,
        old_team: prevTeam,
        new_team: currentTeam,
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

  tierChanges.sort((a, b) => String(a.player_name).localeCompare(String(b.player_name), "ko"));
  affiliationChanges.sort((a, b) => String(a.player_name).localeCompare(String(b.player_name), "ko"));
  joiners.sort((a, b) => String(a.player_name).localeCompare(String(b.player_name), "ko"));
  removals.sort((a, b) => String(a.player_name).localeCompare(String(b.player_name), "ko"));

  return { tierChanges, affiliationChanges, joiners, removals };
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

function countAlertsBySeverity(alerts) {
  return {
    critical: alerts.filter((a) => a.severity === "critical").length,
    high: alerts.filter((a) => a.severity === "high").length,
    medium: alerts.filter((a) => a.severity === "medium").length,
    low: alerts.filter((a) => a.severity === "low").length,
    total: alerts.length,
  };
}

function buildSuccessMessage({ snapshot, alertsDoc, runUrl }) {
  const beforePlayers = loadBaselinePlayers(BASELINE_PATH);
  const afterPlayers = loadCurrentRosterState(PROJECTS_DIR);
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
  const deltaComparable = Boolean(
    snapshot &&
      snapshot.delta_reference &&
      snapshot.delta_reference.comparable
  );
  const newMatches = summaryCheck.new_matches_total;
  const joinersForMessage = Array.isArray(summaryCheck.joiners) && summaryCheck.joiners.length
    ? summaryCheck.joiners
    : joiners;

  const lines = [
    `산박대표님.일일 업데이트보고입니다. ${alertCounts.total > 0 ? "(경고 포함)" : ""} (${dateLabelFromSnapshot(snapshot)})`.trim(),
    "",
  ];

  if (
    !tierChanges.length &&
    !affiliationChanges.length &&
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
      for (const item of tierChanges) {
        lines.push(`- ${item.player_name} (${item.team_name}) : ${item.old_tier} -> ${item.new_tier}`);
      }
      lines.push("");
    }

    if (affiliationChanges.length) {
      lines.push("🏠 소속 변동");
      for (const item of affiliationChanges) {
        lines.push(`- ${item.player_name} : ${item.old_team} -> ${item.new_team}`);
      }
      lines.push("");
    }

    if (joinersForMessage.length) {
      lines.push("🆕 신규 합류");
      for (const item of joinersForMessage) {
        lines.push(`- ${item.player_name} (${item.team_name})`);
      }
      lines.push("");
    }

    if (removals.length) {
      lines.push("📤 로스터 제외");
      for (const item of removals) {
        lines.push(`- ${item.player_name} (${item.team_name})`);
      }
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
      for (const item of todayTop.players) {
        lines.push(`- ${item.player_name} (${item.team_name}) : ${item.today_matches}경기`);
      }
    }
  }

  if ((alertCounts.total || 0) > 0) {
    lines.push("");
    lines.push(
      `주의 알림: ${alertCounts.total}건 (critical ${alertCounts.critical}, high ${alertCounts.high}, medium ${alertCounts.medium}, low ${alertCounts.low})`
    );
    if (alertCounts.critical === 0 && alertCounts.high === 0) {
      lines.push("경고는 있었지만 반영은 계속 진행되었습니다.");
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

function buildMessage({ outcome, source, runUrl }) {
  const snapshotPath = latestFileByPrefix("daily_pipeline_snapshot_");
  const alertsPath = latestFileByPrefix("daily_pipeline_alerts_");
  const snapshot = readJsonIfExists(snapshotPath);
  const alertsDoc = readJsonIfExists(alertsPath);
  const opsPipelineReport = readJsonIfExists(OPS_PIPELINE_REPORT_PATH);
  if (outcome !== "success") {
    return buildFailureMessage({ snapshot, runUrl, alertsDoc, opsPipelineReport, source });
  }
  return buildSuccessMessage({ snapshot, alertsDoc, runUrl, source });
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

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
});
