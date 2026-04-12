const fs = require("fs");
const path = require("path");

const ROOT = path.resolve(__dirname, "..", "..");
const REPORTS_DIR = path.join(ROOT, "tmp", "reports");

function argValue(flag, fallback = null) {
  const idx = process.argv.indexOf(flag);
  if (idx >= 0 && process.argv[idx + 1]) return process.argv[idx + 1];
  return fallback;
}

function ensureDir(p) {
  fs.mkdirSync(p, { recursive: true });
}

function readJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, "utf8").replace(/^\uFEFF/, ""));
}

function writeJson(filePath, obj) {
  ensureDir(path.dirname(filePath));
  fs.writeFileSync(filePath, JSON.stringify(obj, null, 2), "utf8");
}

function writeCsv(filePath, rows) {
  ensureDir(path.dirname(filePath));
  if (!rows.length) {
    fs.writeFileSync(filePath, "", "utf8");
    return;
  }
  const headers = Object.keys(rows[0]);
  const esc = (v) => {
    const s = String(v ?? "");
    return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  const lines = [
    headers.join(","),
    ...rows.map((row) => headers.map((h) => esc(row[h])).join(",")),
  ];
  fs.writeFileSync(filePath, lines.join("\n"), "utf8");
}

function stableStringify(value) {
  if (Array.isArray(value)) {
    return `[${value.map((item) => stableStringify(item)).join(",")}]`;
  }
  if (value && typeof value === "object") {
    return `{${Object.keys(value)
      .sort((a, b) => String(a).localeCompare(String(b)))
      .map((key) => `${JSON.stringify(key)}:${stableStringify(value[key])}`)
      .join(",")}}`;
  }
  return JSON.stringify(value);
}

function ensureConsistentAlertSettings(snapshots) {
  if (!snapshots.length) return;

  const first = snapshots[0];
  const baselineBlocking = stableStringify(first.alerts && first.alerts.blocking_severities);
  const baselineRules = stableStringify(first.alerts && first.alerts.applied_rules);

  for (const item of snapshots.slice(1)) {
    const currentBlocking = stableStringify(item.alerts && item.alerts.blocking_severities);
    const currentRules = stableStringify(item.alerts && item.alerts.applied_rules);
    if (currentBlocking !== baselineBlocking || currentRules !== baselineRules) {
      throw new Error(
        `Chunk alert settings mismatch: ${item.tag} differs from ${first.tag}. Check blocking_severities/applied_rules consistency.`
      );
    }
  }
}

function main() {
  const outputDate = argValue("--output-date", "");
  const tagsRaw = argValue("--chunk-date-tags", "");
  const tags = tagsRaw
    .split(",")
    .map((v) => v.trim())
    .filter(Boolean);

  if (!outputDate) {
    throw new Error("Missing --output-date (e.g. 2026-03-22)");
  }
  if (!tags.length) {
    throw new Error("Missing --chunk-date-tags");
  }

  const snapshots = tags.map((tag) => {
    const snapshotPath = path.join(REPORTS_DIR, `daily_pipeline_snapshot_${tag}.json`);
    const alertsPath = path.join(REPORTS_DIR, `daily_pipeline_alerts_${tag}.json`);
    if (!fs.existsSync(snapshotPath)) {
      throw new Error(`Missing chunk snapshot: ${path.relative(ROOT, snapshotPath).replace(/\\/g, "/")}`);
    }
    if (!fs.existsSync(alertsPath)) {
      throw new Error(`Missing chunk alerts: ${path.relative(ROOT, alertsPath).replace(/\\/g, "/")}`);
    }
    return {
      tag,
      snapshotPath,
      alertsPath,
      snapshot: readJson(snapshotPath),
      alerts: readJson(alertsPath),
    };
  });

  ensureConsistentAlertSettings(snapshots);

  const first = snapshots[0].snapshot;
  const teamMap = new Map();
  const failedPlayers = [];
  const recoveryActions = [];
  const rosterSyncByChunk = [];
  const aliasByChunk = [];
  const tableByChunk = [];
  const alertRows = [];

  for (const item of snapshots) {
    const teams = Array.isArray(item.snapshot.teams) ? item.snapshot.teams : [];
    for (const row of teams) {
      teamMap.set(String(row.team_code || row.team), row);
    }
    failedPlayers.push(...(Array.isArray(item.snapshot.failed_players) ? item.snapshot.failed_players : []));
    recoveryActions.push(...(Array.isArray(item.snapshot.recovery_actions) ? item.snapshot.recovery_actions : []));
    rosterSyncByChunk.push({
      tag: item.tag,
      summary: item.snapshot.roster_sync || null,
    });
    aliasByChunk.push({
      tag: item.tag,
      summary: item.snapshot.display_alias_apply || null,
    });
    tableByChunk.push({
      tag: item.tag,
      summary: item.snapshot.team_table_report || null,
    });
    alertRows.push(...(Array.isArray(item.alerts.alerts) ? item.alerts.alerts : []));
  }

  const mergedTeams = Array.from(teamMap.values()).sort((a, b) =>
    String(a.team_code || "").localeCompare(String(b.team_code || ""))
  );

  const mergedSnapshot = {
    generated_at: new Date().toISOString(),
    started_at: first.started_at || null,
    period_from: first.period_from || null,
    period_to: first.period_to || null,
    strict: Boolean(first.strict),
    chunked_merge: {
      output_date: outputDate,
      chunk_tags: tags,
      chunk_count: tags.length,
      source_snapshots: snapshots.map((s) => path.relative(ROOT, s.snapshotPath).replace(/\\/g, "/")),
      source_alerts: snapshots.map((s) => path.relative(ROOT, s.alertsPath).replace(/\\/g, "/")),
    },
    roster_sync: {
      ok: rosterSyncByChunk.every((r) => r.summary && r.summary.ok !== false),
      chunks: rosterSyncByChunk,
    },
    display_alias_apply: {
      ok: aliasByChunk.every((r) => r.summary && r.summary.ok !== false),
      chunks: aliasByChunk,
    },
    fa_record_metadata: first.fa_record_metadata || null,
    teams: mergedTeams,
    failed_players: failedPlayers,
    recovery_actions: recoveryActions,
    team_table_report: {
      ok: tableByChunk.every((r) => r.summary && r.summary.ok !== false),
      chunks: tableByChunk,
    },
    delta_reference: first.delta_reference || null,
    previous_snapshot: first.previous_snapshot || null,
  };

  const counts = {
    critical: alertRows.filter((a) => a.severity === "critical").length,
    high: alertRows.filter((a) => a.severity === "high").length,
    medium: alertRows.filter((a) => a.severity === "medium").length,
    low: alertRows.filter((a) => a.severity === "low").length,
    total: alertRows.length,
  };

  const mergedAlerts = {
    generated_at: new Date().toISOString(),
    date_tag: outputDate,
    strict: Boolean(first.strict),
    chunked_merge: {
      chunk_tags: tags,
      chunk_count: tags.length,
    },
    blocking_severities: snapshots[0].alerts.blocking_severities || ["critical", "high"],
    applied_rules: snapshots[0].alerts.applied_rules || {},
    counts,
    alerts: alertRows,
  };

  const outSnapshotJson = path.join(REPORTS_DIR, `daily_pipeline_snapshot_${outputDate}.json`);
  const outSnapshotCsv = path.join(REPORTS_DIR, `daily_pipeline_snapshot_${outputDate}.csv`);
  const outAlertsJson = path.join(REPORTS_DIR, `daily_pipeline_alerts_${outputDate}.json`);
  const outAlertsCsv = path.join(REPORTS_DIR, `daily_pipeline_alerts_${outputDate}.csv`);
  const latestSnapshotJson = path.join(REPORTS_DIR, "daily_pipeline_snapshot_latest.json");
  const latestAlertsJson = path.join(REPORTS_DIR, "daily_pipeline_alerts_latest.json");

  writeJson(outSnapshotJson, mergedSnapshot);
  writeJson(latestSnapshotJson, mergedSnapshot);
  writeCsv(
    outSnapshotCsv,
    mergedTeams.map((r) => ({
      team: r.team,
      team_code: r.team_code,
      players: r.players,
      excluded_players: r.excluded_players ?? 0,
      fetched_players: r.fetched_players ?? 0,
      reused_players: r.reused_players ?? 0,
      fetch_fail: r.fetch_fail,
      csv_fail: r.csv_fail,
      total_matches: r.total_matches,
      total_wins: r.total_wins,
      total_losses: r.total_losses,
      zero_record_players: r.zero_record_players,
      zero_players: r.zero_players,
      delta_total_matches: r.delta_total_matches ?? "",
      delta_total_wins: r.delta_total_wins ?? "",
      delta_total_losses: r.delta_total_losses ?? "",
      delta_players: r.delta_players ?? "",
    }))
  );
  writeJson(outAlertsJson, mergedAlerts);
  writeJson(latestAlertsJson, mergedAlerts);
  writeCsv(
    outAlertsCsv,
    alertRows.map((a) => ({
      severity: a.severity,
      team: a.team,
      team_code: a.team_code,
      rule: a.rule,
      message: a.message,
    }))
  );

  console.log(
    JSON.stringify(
      {
        status: "pass",
        output_date: outputDate,
        chunk_tags: tags,
        teams: mergedTeams.length,
        alerts: counts,
        snapshot_json: path.relative(ROOT, outSnapshotJson).replace(/\\/g, "/"),
        alerts_json: path.relative(ROOT, outAlertsJson).replace(/\\/g, "/"),
      },
      null,
      2
    )
  );
}

main();
