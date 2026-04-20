const fs = require("fs");
const path = require("path");
const { resolveLatestReportFile } = require("./lib/discord-summary");

const ROOT = path.resolve(__dirname, "..", "..");
const REPORTS_DIR = path.join(ROOT, "tmp", "reports");
const HOMEPAGE_INTEGRITY_REPORT_PATH = path.join(REPORTS_DIR, "homepage_integrity_report.json");

function readJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, "utf8").replace(/^\uFEFF/, ""));
}

function describeSupabaseSync(manualRefresh) {
  if (!manualRefresh || typeof manualRefresh !== "object") {
    return "-";
  }

  const details =
    manualRefresh.supabase_sync && typeof manualRefresh.supabase_sync === "object"
      ? manualRefresh.supabase_sync
      : null;

  if (!details) {
    if (typeof manualRefresh.with_supabase_sync === "boolean") {
      return manualRefresh.with_supabase_sync ? "enabled" : "disabled (collect-only)";
    }
    return "-";
  }

  const status = String(details.status || "").trim() || "unknown";
  if (status === "completed") {
    const cache = details.cache_revalidation && typeof details.cache_revalidation === "object"
      ? details.cache_revalidation
      : null;
    if (!cache) return "completed";
    const cacheStatus = String(cache.status || "").trim();
    const cacheReason = String(cache.reason || "").trim();
    if (!cacheStatus || cacheStatus === "completed") return "completed";
    return cacheReason
      ? `completed, cache_revalidation=${cacheStatus} (${cacheReason})`
      : `completed, cache_revalidation=${cacheStatus}`;
  }
  if (status === "disabled") return "disabled (not requested)";
  if (status === "skipped") {
    const reason = String(details.skip_reason || "").trim() || "unspecified";
    const total = Number(details.blocking_alerts_total || 0);
    const warning = String(details.warning || "").trim();
    const suffix = total > 0 ? `, blocking_alerts=${total}` : "";
    return warning
      ? `skipped (${reason}${suffix}): ${warning}`
      : total > 0
        ? `skipped (${reason}, blocking_alerts=${total})`
        : `skipped (${reason})`;
  }
  return status;
}

function describeHomepageIntegrity() {
  if (!fs.existsSync(HOMEPAGE_INTEGRITY_REPORT_PATH)) return null;
  const report = readJson(HOMEPAGE_INTEGRITY_REPORT_PATH);
  const live =
    report &&
    report.summary &&
    report.summary.live &&
    typeof report.summary.live === "object"
      ? report.summary.live
      : null;
  if (!live) return null;
  const heroMedia =
    report &&
    report.summary &&
    report.summary.hero_media &&
    typeof report.summary.hero_media === "object"
      ? report.summary.hero_media
      : null;
  return {
    generated_at: String(report.generated_at || "").trim() || "-",
    snapshot_updated_at: String(live.snapshot_updated_at || "").trim() || "-",
    snapshot_is_fresh: Boolean(live.snapshot_is_fresh),
    stale_snapshot_disagreement_count: Number(live.stale_snapshot_disagreement_count || 0),
    hero_media_active_ok: heroMedia ? Boolean(heroMedia.active_ok) : null,
    hero_media_active_count: heroMedia ? Number(heroMedia.active_count || 0) : null,
    hero_media_invalid_rows_count: heroMedia ? Number(heroMedia.invalid_rows_count || 0) : null,
  };
}

function main() {
  const snapshotPath = resolveLatestReportFile(REPORTS_DIR, "daily_pipeline_snapshot_");
  const alertsPath = resolveLatestReportFile(REPORTS_DIR, "daily_pipeline_alerts_");
  const manualRefreshPath = path.join(REPORTS_DIR, "manual_refresh_latest.json");
  if (!snapshotPath || !alertsPath) {
    console.error("Missing daily pipeline reports.");
    process.exit(1);
  }

  const snapshot = readJson(snapshotPath);
  const alertsDoc = readJson(alertsPath);
  const manualRefresh = fs.existsSync(manualRefreshPath) ? readJson(manualRefreshPath) : null;
  const teams = Array.isArray(snapshot.teams) ? snapshot.teams : [];
  const alerts = Array.isArray(alertsDoc.alerts) ? alertsDoc.alerts : [];

  const critical = alerts.filter((a) => a.severity === "critical").length;
  const high = alerts.filter((a) => a.severity === "high").length;
  const medium = alerts.filter((a) => a.severity === "medium").length;
  const low = alerts.filter((a) => a.severity === "low").length;

  console.log(`snapshot: ${path.relative(ROOT, snapshotPath)}`);
  console.log(`alerts:   ${path.relative(ROOT, alertsPath)}`);
  console.log(`generated_at: ${snapshot.generated_at || "-"}`);
  if (manualRefresh) {
    console.log(`supabase_sync: ${describeSupabaseSync(manualRefresh)}`);
  }
  console.log(`period: ${snapshot.period_from || "-"} ~ ${snapshot.period_to || "-"}`);
  console.log(`previous_snapshot: ${snapshot.previous_snapshot || "-"}`);
  console.log(
    `delta_comparable: ${snapshot.delta_reference && snapshot.delta_reference.comparable ? "yes" : "no"}`
  );
  console.log(
    `alerts critical/high/medium/low: ${critical}/${high}/${medium}/${low}`
  );
  console.log(`alerts_total: ${alerts.length}`);
  const homepageIntegrity = describeHomepageIntegrity();
  if (homepageIntegrity) {
    console.log(
      `homepage_integrity: ${homepageIntegrity.snapshot_is_fresh ? "fresh" : "stale"} (snapshot_updated_at=${homepageIntegrity.snapshot_updated_at}, disagreement_count=${homepageIntegrity.stale_snapshot_disagreement_count})`
    );
    if (homepageIntegrity.hero_media_active_ok !== null) {
      console.log(
        `hero_media_integrity: ${homepageIntegrity.hero_media_active_ok ? "ok" : "issue"} (active_count=${homepageIntegrity.hero_media_active_count}, invalid_rows=${homepageIntegrity.hero_media_invalid_rows_count})`
      );
    }
  }

  const topMatchDeltas = teams
    .map((t) => ({
      team: t.team,
      team_code: t.team_code,
      delta_total_matches: typeof t.delta_total_matches === "number" ? t.delta_total_matches : null,
    }))
    .filter((row) => typeof row.delta_total_matches === "number" && row.delta_total_matches !== 0)
    .sort((a, b) => Math.abs(b.delta_total_matches) - Math.abs(a.delta_total_matches))
    .slice(0, 5);

  if (topMatchDeltas.length) {
    console.log("top_match_deltas:");
    for (const row of topMatchDeltas) {
      console.log(
        `  - ${row.team_code}: ${row.delta_total_matches > 0 ? "+" : ""}${row.delta_total_matches} (${row.team})`
      );
    }
  }

  const table = teams.map((t) => ({
    team: t.team,
    players: t.players,
    fetched_players: t.fetched_players ?? "",
    reused_players: t.reused_players ?? "",
    fetch_fail: t.fetch_fail,
    csv_fail: t.csv_fail,
    zero_record_players: t.zero_record_players,
    total_matches: t.total_matches,
    delta_total_matches:
      typeof t.delta_total_matches === "number" ? t.delta_total_matches : "",
  }));
  console.table(table);

  const hasBlocking = critical > 0 || high > 0;
  if (hasBlocking) {
    process.exitCode = 1;
    console.error("Blocking alerts detected (critical/high).");
  }
}

main();
