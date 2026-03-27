const fs = require("fs");
const path = require("path");

const ROOT = path.resolve(__dirname, "..", "..");
const ALERT_RULES_PATH = path.join(ROOT, "data", "metadata", "pipeline_alert_rules.v1.json");
const SEVERITIES = new Set(["critical", "high", "medium", "low"]);

function fail(errors, field, message) {
  errors.push(`${field}: ${message}`);
}

function isIsoDateTime(value) {
  return typeof value === "string" && !Number.isNaN(Date.parse(value));
}

function validateSeverity(errors, field, value) {
  if (!SEVERITIES.has(String(value || ""))) {
    fail(errors, field, "must be one of critical, high, medium, low");
  }
}

function main() {
  if (!fs.existsSync(ALERT_RULES_PATH)) {
    throw new Error(`Missing alert rules file: ${ALERT_RULES_PATH}`);
  }

  const doc = JSON.parse(fs.readFileSync(ALERT_RULES_PATH, "utf8").replace(/^\uFEFF/, ""));
  const errors = [];

  if (doc.schema_version !== "1.0.0") {
    fail(errors, "schema_version", "must be 1.0.0");
  }
  if (!isIsoDateTime(doc.updated_at)) {
    fail(errors, "updated_at", "must be ISO datetime");
  }

  if (!Array.isArray(doc.blocking_severities) || doc.blocking_severities.length === 0) {
    fail(errors, "blocking_severities", "must be a non-empty array");
  } else {
    doc.blocking_severities.forEach((value, index) => {
      validateSeverity(errors, `blocking_severities[${index}]`, value);
    });
  }

  if (!doc.rules || typeof doc.rules !== "object" || Array.isArray(doc.rules)) {
    fail(errors, "rules", "must be an object");
  } else {
    validateSeverity(errors, "rules.pipeline_failure_severity", doc.rules.pipeline_failure_severity);
    validateSeverity(errors, "rules.zero_record_players_severity", doc.rules.zero_record_players_severity);
    validateSeverity(errors, "rules.negative_delta_matches_severity", doc.rules.negative_delta_matches_severity);
    validateSeverity(errors, "rules.roster_size_changed_severity", doc.rules.roster_size_changed_severity);
    validateSeverity(errors, "rules.no_new_matches_severity", doc.rules.no_new_matches_severity);

    if (typeof doc.rules.no_new_matches_enabled !== "boolean") {
      fail(errors, "rules.no_new_matches_enabled", "must be boolean");
    }

    if (
      !doc.rules.zero_record_players_allowlist ||
      typeof doc.rules.zero_record_players_allowlist !== "object" ||
      Array.isArray(doc.rules.zero_record_players_allowlist)
    ) {
      fail(errors, "rules.zero_record_players_allowlist", "must be an object");
    } else {
      for (const [teamCode, players] of Object.entries(doc.rules.zero_record_players_allowlist)) {
        if (!/^[a-z0-9_-]+$/i.test(String(teamCode))) {
          fail(errors, `rules.zero_record_players_allowlist.${teamCode}`, "invalid team code key");
        }
        if (!Array.isArray(players)) {
          fail(errors, `rules.zero_record_players_allowlist.${teamCode}`, "must be an array");
          continue;
        }
        players.forEach((name, index) => {
          if (typeof name !== "string" || !name.trim()) {
            fail(errors, `rules.zero_record_players_allowlist.${teamCode}[${index}]`, "must be non-empty string");
          }
        });
      }
    }

    if (!Array.isArray(doc.rules.roster_size_changed_team_allowlist)) {
      fail(errors, "rules.roster_size_changed_team_allowlist", "must be an array");
    } else {
      doc.rules.roster_size_changed_team_allowlist.forEach((teamCode, index) => {
        if (typeof teamCode !== "string" || !teamCode.trim()) {
          fail(errors, `rules.roster_size_changed_team_allowlist[${index}]`, "must be non-empty string");
        }
      });
    }
  }

  if (errors.length > 0) {
    console.error("Pipeline alert rules validation failed:");
    for (const error of errors) {
      console.error(`- ${error}`);
    }
    process.exit(1);
  }

  console.log(`OK: ${ALERT_RULES_PATH}`);
  console.log(`blocking_severities: ${doc.blocking_severities.join(", ")}`);
}

main();
