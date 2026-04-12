const fs = require("fs");
const path = require("path");
const { buildDiscordSummaryCheck, readJsonIfExists, resolveLatestReportFile } = require("./lib/discord-summary");

const ROOT = path.resolve(__dirname, "..", "..");
const DEFAULT_REPORTS_DIR = path.join(ROOT, "tmp", "reports");
const DEFAULT_PROJECTS_DIR = path.join(ROOT, "data", "metadata", "projects");
const ALERT_RULES_PATH = path.join(ROOT, "data", "metadata", "pipeline_alert_rules.v1.json");

function argValue(flag, fallback = null) {
  const idx = process.argv.indexOf(flag);
  if (idx >= 0 && process.argv[idx + 1]) return process.argv[idx + 1];
  return fallback;
}

function hasFlag(flag) {
  return process.argv.includes(flag);
}

function relativePath(filePath) {
  if (!filePath) return null;
  return path.relative(ROOT, filePath).replace(/\\/g, "/");
}

function readJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, "utf8").replace(/^\uFEFF/, ""));
}

function homepageIntegrityMaxAgeMinutes() {
  if (!fs.existsSync(ALERT_RULES_PATH)) return 180;
  try {
    const doc = readJson(ALERT_RULES_PATH);
    const value = Number(
      doc && doc.rules && doc.rules.homepage_integrity_report_max_age_minutes
        ? doc.rules.homepage_integrity_report_max_age_minutes
        : 180
    );
    if (!Number.isFinite(value) || value < 0) return 180;
    return value;
  } catch {
    return 180;
  }
}

function evaluateHomepageIntegrityFreshness(report, referenceTimeMs = Date.now()) {
  const generatedAt = String(report && report.generated_at ? report.generated_at : "").trim();
  const generatedTime = generatedAt ? Date.parse(generatedAt) : Number.NaN;
  const maxAgeMinutes = homepageIntegrityMaxAgeMinutes();
  if (!Number.isFinite(generatedTime)) {
    return {
      fresh: false,
      detail: "missing",
      generated_at: generatedAt || null,
      max_age_minutes: maxAgeMinutes,
    };
  }
  const ageMs = referenceTimeMs - generatedTime;
  const fresh = Number.isFinite(ageMs) && ageMs >= 0 && ageMs <= maxAgeMinutes * 60 * 1000;
  const ageMinutes = Math.floor(ageMs / 60000);
  return {
    fresh,
    detail: fresh ? `fresh (${ageMinutes}m)` : `stale (${ageMinutes}m)`,
    generated_at: generatedAt,
    max_age_minutes: maxAgeMinutes,
  };
}

function evaluateReadiness(input) {
  const checks = [
    {
      key: "ops_pipeline_pass",
      ok: input.opsPipelinePass === true,
      detail: input.opsPipelineStatus || "missing",
    },
    {
      key: "manual_refresh_pass",
      ok: input.manualRefreshPass === true,
      detail: input.manualRefreshStatus || "missing",
    },
    {
      key: "supabase_sync_enabled",
      ok: input.supabaseSyncEnabled === true,
      detail: input.supabaseSyncEnabled ? "enabled" : "disabled",
    },
    {
      key: "homepage_integrity_fresh",
      ok: input.homepageIntegrityFresh === true,
      detail: input.homepageIntegrityDetail || "missing",
    },
    {
      key: "blocking_alerts_zero",
      ok: Number(input.blockingAlerts || 0) === 0,
      detail: String(Number(input.blockingAlerts || 0)),
    },
    {
      key: "discord_removals_zero",
      ok: Number(input.discordRemovals || 0) === 0,
      detail: String(Number(input.discordRemovals || 0)),
    },
    {
      key: "zero_record_needs_review_zero",
      ok: Number(input.zeroRecordNeedsReview || 0) === 0,
      detail: String(Number(input.zeroRecordNeedsReview || 0)),
    },
  ];

  const failedChecks = checks.filter((check) => !check.ok).map((check) => check.key);
  return {
    ready: failedChecks.length === 0,
    failed_checks: failedChecks,
    checks,
  };
}

function toMarkdown(summary) {
  const lines = [
    "## Site Integration Readiness",
    "",
    `- Ready: ${summary.ready ? "yes" : "no"}`,
    `- Ops Pipeline: ${summary.ops_pipeline_status || "-"}`,
    `- Manual Refresh: ${summary.manual_refresh_status || "-"}`,
    `- Supabase Sync: ${summary.supabase_sync_enabled ? "enabled" : "disabled"}`,
    `- Homepage Integrity: ${summary.homepage_integrity_fresh ? "fresh" : "stale"}`,
    `- Blocking Alerts: ${summary.blocking_alerts}`,
    `- Stale Snapshot Operational Alerts: ${summary.stale_snapshot_operational_alerts}`,
    `- Discord Removals: ${summary.discord_removals}`,
    `- Zero-Record Needs Review: ${summary.zero_record_needs_review}`,
  ];

  if (summary.discord_roster_source) {
    lines.push(`- Discord Roster Source: ${summary.discord_roster_source}`);
  }

  lines.push("");
  lines.push("### Checks");
  for (const check of summary.checks) {
    lines.push(`- ${check.ok ? "PASS" : "FAIL"} ${check.key}: ${check.detail}`);
  }

  if (summary.failed_checks.length) {
    lines.push("");
    lines.push("### Blockers");
    for (const key of summary.failed_checks) {
      lines.push(`- ${key}`);
    }
  }

  return lines.join("\n");
}

function main() {
  const reportsDir = path.resolve(String(argValue("--reports-dir", DEFAULT_REPORTS_DIR) || ""));
  const projectsDir = path.resolve(String(argValue("--projects-dir", DEFAULT_PROJECTS_DIR) || ""));
  const baselinePath = path.join(reportsDir, "manual_refresh_baseline.json");
  const snapshotPath = resolveLatestReportFile(reportsDir, "daily_pipeline_snapshot_");
  const alertsPath = resolveLatestReportFile(reportsDir, "daily_pipeline_alerts_");
  const opsPipelinePath = path.join(reportsDir, "ops_pipeline_latest.json");
  const manualRefreshPath = path.join(reportsDir, "manual_refresh_latest.json");
  const zeroRecordReviewPath = path.join(reportsDir, "zero_record_review_latest.json");
  const homepageIntegrityPath = path.join(reportsDir, "homepage_integrity_report.json");

  const snapshot = readJsonIfExists(snapshotPath);
  const alertsDoc = readJsonIfExists(alertsPath);
  const opsPipeline = readJsonIfExists(opsPipelinePath);
  const manualRefresh = readJsonIfExists(manualRefreshPath);
  const zeroRecordReview = readJsonIfExists(zeroRecordReviewPath);
  const homepageIntegrity = readJsonIfExists(homepageIntegrityPath);

  if (!snapshot || !alertsDoc) {
    console.error("Missing snapshot or alerts reports.");
    process.exit(1);
  }

  const summaryCheck = buildDiscordSummaryCheck({
    reportsDir,
    baselinePath,
    projectsDir,
    snapshot,
    alertsDoc,
  });
  const alertCounts =
    alertsDoc && alertsDoc.counts && typeof alertsDoc.counts === "object"
      ? alertsDoc.counts
      : { critical: 0, high: 0 };
  const blockingAlerts = Number(alertCounts.critical || 0) + Number(alertCounts.high || 0);
  const staleSnapshotOperationalAlerts = Array.isArray(alertsDoc && alertsDoc.alerts)
    ? alertsDoc.alerts.filter((row) => String(row && row.rule ? row.rule : "") === "stale_live_snapshot_disagreement")
        .length
    : 0;
  const zeroRecordNeedsReview = Number(
    zeroRecordReview && zeroRecordReview.needs_review_count ? zeroRecordReview.needs_review_count : 0
  );
  const homepageIntegrityFreshness = evaluateHomepageIntegrityFreshness(homepageIntegrity);

  const evaluation = evaluateReadiness({
    opsPipelinePass: String(opsPipeline && opsPipeline.status ? opsPipeline.status : "").trim().toLowerCase() === "pass",
    opsPipelineStatus: String(opsPipeline && opsPipeline.status ? opsPipeline.status : "").trim() || null,
    manualRefreshPass: String(manualRefresh && manualRefresh.status ? manualRefresh.status : "").trim().toLowerCase() === "pass",
    manualRefreshStatus: String(manualRefresh && manualRefresh.status ? manualRefresh.status : "").trim() || null,
    supabaseSyncEnabled: Boolean(manualRefresh && manualRefresh.with_supabase_sync === true),
    homepageIntegrityFresh: homepageIntegrityFreshness.fresh,
    homepageIntegrityDetail: homepageIntegrityFreshness.detail,
    blockingAlerts,
    discordRemovals: Array.isArray(summaryCheck.removals) ? summaryCheck.removals.length : 0,
    zeroRecordNeedsReview,
  });

  const output = {
    generated_at: new Date().toISOString(),
    reports_dir: relativePath(reportsDir),
    snapshot: relativePath(snapshotPath),
    alerts: relativePath(alertsPath),
    ops_pipeline_report: relativePath(opsPipelinePath),
    manual_refresh_report: relativePath(manualRefreshPath),
    zero_record_review_report: relativePath(zeroRecordReviewPath),
    homepage_integrity_report: relativePath(homepageIntegrityPath),
    ready: evaluation.ready,
    failed_checks: evaluation.failed_checks,
    checks: evaluation.checks,
    ops_pipeline_status: String(opsPipeline && opsPipeline.status ? opsPipeline.status : "").trim() || null,
    manual_refresh_status: String(manualRefresh && manualRefresh.status ? manualRefresh.status : "").trim() || null,
    supabase_sync_enabled: Boolean(manualRefresh && manualRefresh.with_supabase_sync === true),
    homepage_integrity_fresh: homepageIntegrityFreshness.fresh,
    homepage_integrity_detail: homepageIntegrityFreshness.detail,
    homepage_integrity_generated_at: homepageIntegrityFreshness.generated_at,
    blocking_alerts: blockingAlerts,
    stale_snapshot_operational_alerts: staleSnapshotOperationalAlerts,
    discord_removals: Array.isArray(summaryCheck.removals) ? summaryCheck.removals.length : 0,
    discord_roster_source: summaryCheck.roster_source || null,
    zero_record_needs_review: zeroRecordNeedsReview,
  };

  if (hasFlag("--markdown")) {
    console.log(toMarkdown(output));
    return;
  }

  console.log(JSON.stringify(output, null, 2));
  if (!output.ready && !hasFlag("--allow-fail")) {
    process.exit(1);
  }
}

if (require.main === module) {
  main();
}

module.exports = {
  evaluateReadiness,
  evaluateHomepageIntegrityFreshness,
};
