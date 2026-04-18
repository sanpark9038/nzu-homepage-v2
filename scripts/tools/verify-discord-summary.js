const fs = require("fs");
const path = require("path");
const {
  mergedEntityIdLookup,
  buildDiscordSummaryCheck,
  loadBaselinePlayers,
  loadCurrentRosterState,
  loadCurrentRosterStateSnapshot,
  readJsonIfExists,
  resolveLatestReportFile,
} = require("./lib/discord-summary");
const {
  buildAffiliationConfidenceLookup,
  comparePlayerChanges,
  formatAffiliationChangeRow,
} = require("./send-manual-refresh-discord");

const ROOT = path.resolve(__dirname, "..", "..");
const DEFAULT_REPORTS_DIR = path.join(ROOT, "tmp", "reports");
const DEFAULT_BASELINE_PATH = path.join(DEFAULT_REPORTS_DIR, "manual_refresh_baseline.json");
const DEFAULT_PROJECTS_DIR = path.join(ROOT, "data", "metadata", "projects");

function argValue(flag, fallback = null) {
  const idx = process.argv.indexOf(flag);
  if (idx >= 0 && process.argv[idx + 1]) return process.argv[idx + 1];
  return fallback;
}

function hasFlag(flag) {
  return process.argv.includes(flag);
}

function resolveReportsDir() {
  const input = String(argValue("--reports-dir", DEFAULT_REPORTS_DIR) || "").trim();
  return path.resolve(input);
}

function resolveFilePath(value, fallback) {
  const text = String(value || "").trim();
  if (!text) return fallback;
  return path.resolve(text);
}

function relativePath(filePath) {
  return path.relative(ROOT, filePath).replace(/\\/g, "/");
}

function toMarkdown(summary) {
  const lines = [
    "## Discord Summary Check",
    "",
    `- Snapshot: \`${summary.snapshot}\``,
    `- Alerts: \`${summary.alerts}\``,
    `- Supabase Sync: ${
      summary.supabase_sync === true
        ? "enabled"
        : summary.supabase_sync === false
          ? "disabled (collect-only)"
          : "unknown"
    }`,
    `- Period: ${summary.period_from || "-"} ~ ${summary.period_to || "-"}`,
    `- Previous Snapshot: ${summary.previous_snapshot || "-"}`,
    `- Comparable: ${summary.delta_reference && summary.delta_reference.comparable ? "yes" : "no"}`,
    `- New Matches Total: ${summary.discord_summary_check.new_matches_total}`,
  ];

  const joiners = Array.isArray(summary.discord_summary_check.joiners)
    ? summary.discord_summary_check.joiners
    : [];
  const affiliationChanges = Array.isArray(summary.discord_summary_check.affiliation_changes)
    ? summary.discord_summary_check.affiliation_changes
    : [];
  const alerts = summary.discord_summary_check.alerts || { counts: {}, alerts: [] };
  const topTeamDeltas = Array.isArray(summary.discord_summary_check.top_team_deltas)
    ? summary.discord_summary_check.top_team_deltas
    : [];
  const violations = Array.isArray(summary.discord_summary_check.harness_violations)
    ? summary.discord_summary_check.harness_violations
    : [];

  lines.push(
    `- Alerts Count: critical ${alerts.counts.critical || 0}, high ${alerts.counts.high || 0}, medium ${alerts.counts.medium || 0}, low ${alerts.counts.low || 0}`
  );
  lines.push(`- Affiliation Changes: ${affiliationChanges.length}`);
  lines.push(`- Harness Violations: ${violations.length}`);

  if (affiliationChanges.length) {
    lines.push("");
    lines.push("### Affiliation Changes");
    for (const row of affiliationChanges) {
      lines.push(`${formatAffiliationChangeRow(row)} [${row.change_confidence || "unknown"}]`);
    }
  }

  if (joiners.length) {
    lines.push("");
    lines.push("### Roster Joiners");
    for (const row of joiners) {
      lines.push(`- ${row.player_name} (${row.team_name})`);
    }
  }

  if (topTeamDeltas.length) {
    lines.push("");
    lines.push("### Top Team Match Deltas");
    for (const row of topTeamDeltas) {
      lines.push(`- ${row.team} (${row.team_code}): +${row.delta_total_matches} matches`);
    }
  }

  if (Array.isArray(alerts.alerts) && alerts.alerts.length) {
    lines.push("");
    lines.push("### Alerts");
    for (const row of alerts.alerts) {
      lines.push(`- [${row.severity}] ${row.team} (${row.team_code}) ${row.rule}: ${row.message}`);
    }
  }

  if (violations.length) {
    lines.push("");
    lines.push("### Harness Violations");
    for (const row of violations) {
      lines.push(`- ${row.code}: ${row.message}`);
    }
  }

  return lines.join("\n");
}

function buildHarnessViolations(affiliationChanges) {
  const rows = Array.isArray(affiliationChanges) ? affiliationChanges : [];
  const violations = [];

  for (const row of rows) {
    const confidence = String(row && row.change_confidence ? row.change_confidence : "").trim().toLowerCase();
    if (!confidence) {
      violations.push({
        code: "missing_change_confidence",
        message: `${row.player_name || "unknown"} affiliation change is missing change_confidence`,
      });
      continue;
    }

    if (!["confirmed", "inferred", "fallback"].includes(confidence)) {
      violations.push({
        code: "invalid_change_confidence",
        message: `${row.player_name || "unknown"} affiliation change has invalid change_confidence: ${confidence}`,
      });
      continue;
    }

    const formatted = formatAffiliationChangeRow(row);
    const definitive = `- ${row.player_name} : ${row.old_team} -> ${row.new_team}`;
    if ((confidence === "fallback" || confidence === "inferred") && formatted === definitive) {
      violations.push({
        code: `unsafe_${confidence}_wording`,
        message: `${row.player_name || "unknown"} ${confidence} move is missing non-definitive wording`,
      });
    }
  }

  return violations;
}

function buildAffiliationChangeCheck({ reportsDir, baselinePath, projectsDir }) {
  const beforePlayers = loadBaselinePlayers(baselinePath);
  const snapshotPlayers = loadCurrentRosterStateSnapshot(reportsDir);
  const afterPlayers = snapshotPlayers.length ? snapshotPlayers : loadCurrentRosterState(projectsDir);
  const identityLookup = mergedEntityIdLookup({ reportsDir });
  const affiliationConfidenceLookup = buildAffiliationConfidenceLookup({
    reportsDir,
    identityLookup,
  });
  const changes = comparePlayerChanges(beforePlayers, afterPlayers, {
    identityLookup,
    affiliationConfidenceLookup,
  });
  const affiliationChanges = Array.isArray(changes && changes.affiliationChanges) ? changes.affiliationChanges : [];
  const harnessViolations = buildHarnessViolations(affiliationChanges);

  return {
    roster_source: snapshotPlayers.length ? "current_roster_state.json" : "projects_dir",
    affiliation_changes: affiliationChanges,
    harness_violations: harnessViolations,
  };
}

function main() {
  const reportsDir = resolveReportsDir();
  const baselinePath = resolveFilePath(argValue("--baseline", ""), path.join(reportsDir, "manual_refresh_baseline.json"));
  const projectsDir = resolveFilePath(argValue("--projects-dir", ""), DEFAULT_PROJECTS_DIR);
  const manualRefreshPath = path.join(reportsDir, "manual_refresh_latest.json");

  const snapshotPath = resolveFilePath(
    argValue("--snapshot", ""),
    resolveLatestReportFile(reportsDir, "daily_pipeline_snapshot_")
  );
  const alertsPath = resolveFilePath(
    argValue("--alerts", ""),
    resolveLatestReportFile(reportsDir, "daily_pipeline_alerts_")
  );

  if (!snapshotPath || !alertsPath) {
    console.error("Missing snapshot or alerts file.");
    process.exit(1);
  }

  const snapshot = readJsonIfExists(snapshotPath);
  const alertsDoc = readJsonIfExists(alertsPath);
  const manualRefresh = readJsonIfExists(manualRefreshPath);
  if (!snapshot || !alertsDoc) {
    console.error("Unable to read snapshot or alerts JSON.");
    process.exit(1);
  }

  const deltaReference =
    snapshot && snapshot.delta_reference && typeof snapshot.delta_reference === "object"
      ? snapshot.delta_reference
      : null;
  const summaryCheck = buildDiscordSummaryCheck({
    reportsDir,
    baselinePath,
    projectsDir,
    snapshot,
    alertsDoc,
  });
  const affiliationCheck = buildAffiliationChangeCheck({
    reportsDir,
    baselinePath,
    projectsDir,
  });

  const output = {
    snapshot: relativePath(snapshotPath),
    alerts: relativePath(alertsPath),
    baseline: fs.existsSync(baselinePath) ? relativePath(baselinePath) : null,
    generated_at: snapshot.generated_at || null,
    supabase_sync:
      manualRefresh && typeof manualRefresh.with_supabase_sync === "boolean"
        ? manualRefresh.with_supabase_sync
        : null,
    period_from: snapshot.period_from || null,
    period_to: snapshot.period_to || null,
    previous_snapshot: snapshot.previous_snapshot || null,
    delta_reference: deltaReference,
    discord_summary_check: {
      ...summaryCheck,
      roster_source: affiliationCheck.roster_source,
      affiliation_changes: affiliationCheck.affiliation_changes,
      harness_violations: affiliationCheck.harness_violations,
    },
  };

  if (hasFlag("--markdown")) {
    console.log(toMarkdown(output));
    if (affiliationCheck.harness_violations.length && !hasFlag("--no-fail")) {
      process.exit(1);
    }
    return;
  }

  console.log(JSON.stringify(output, null, 2));
  if (affiliationCheck.harness_violations.length && !hasFlag("--no-fail")) {
    process.exit(1);
  }
}

if (require.main === module) {
  main();
}

module.exports = {
  buildAffiliationChangeCheck,
  buildHarnessViolations,
  toMarkdown,
};
