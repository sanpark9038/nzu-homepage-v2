const fs = require("fs");
const path = require("path");

const ROOT = path.resolve(__dirname, "..", "..");
const PROJECTS_DIR = path.join(ROOT, "data", "metadata", "projects");

function isIsoDateTime(value) {
  return typeof value === "string" && !Number.isNaN(Date.parse(value));
}

function fail(errors, field, message) {
  errors.push(`${field}: ${message}`);
}

function warn(warnings, field, message) {
  warnings.push(`${field}: ${message}`);
}

function readJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, "utf8").replace(/^\uFEFF/, ""));
}

function validateRosterPlayer(player, projectCode, index, errors, warnings, seenEntityIds) {
  const p = `roster[${index}]`;
  if (!player || typeof player !== "object") {
    fail(errors, p, "must be an object");
    return;
  }

  if (String(player.team_code || "") !== projectCode) {
    fail(errors, `${p}.team_code`, `must equal project code (${projectCode})`);
  }
  if (!/^eloboard:(male|female)(:mix)?:\d+$/.test(String(player.entity_id || ""))) {
    fail(errors, `${p}.entity_id`, "invalid format");
  }
  if (!Number.isInteger(player.wr_id) || player.wr_id <= 0) {
    fail(errors, `${p}.wr_id`, "must be positive integer");
  }
  if (!["male", "female"].includes(String(player.gender || ""))) {
    fail(errors, `${p}.gender`, "must be male or female");
  }
  if (typeof player.name !== "string" || !player.name.trim()) {
    fail(errors, `${p}.name`, "required non-empty string");
  }
  if (player.display_name !== undefined && player.display_name !== null) {
    if (typeof player.display_name !== "string" || !player.display_name.trim()) {
      warn(warnings, `${p}.display_name`, "should be non-empty string when provided");
    }
  } else {
    warn(warnings, `${p}.display_name`, "missing recommended field");
  }
  if (typeof player.team_name !== "string" || !player.team_name.trim()) {
    fail(errors, `${p}.team_name`, "required non-empty string");
  }
  if (typeof player.tier !== "string" || !player.tier.trim()) {
    fail(errors, `${p}.tier`, "required non-empty string");
  }
  if (typeof player.race !== "string" || !player.race.trim()) {
    fail(errors, `${p}.race`, "required non-empty string");
  }
  if (typeof player.source !== "string" || !player.source.trim()) {
    fail(errors, `${p}.source`, "required non-empty string");
  }
  if (typeof player.missing_in_master !== "boolean") {
    fail(errors, `${p}.missing_in_master`, "must be boolean");
  }
  if (player.profile_url !== undefined && player.profile_url !== null) {
    if (
      !/^https:\/\/eloboard\.com\/(men|women)\/bbs\/board\.php\?bo_table=bj(_m)?_list&wr_id=\d+$/.test(
        String(player.profile_url || "")
      )
    ) {
      warn(warnings, `${p}.profile_url`, "should match Eloboard profile URL format when provided");
    }
  } else {
    warn(warnings, `${p}.profile_url`, "missing recommended field");
  }
  if (player.profile_kind !== undefined && player.profile_kind !== null) {
    if (!["default", "mix"].includes(String(player.profile_kind || ""))) {
      warn(warnings, `${p}.profile_kind`, "should be default or mix when provided");
    }
  } else {
    warn(warnings, `${p}.profile_kind`, "missing recommended field");
  }
  if (player.last_checked_at !== null && player.last_checked_at !== undefined && !isIsoDateTime(player.last_checked_at)) {
    fail(errors, `${p}.last_checked_at`, "must be ISO datetime or null");
  }
  if (player.last_match_at !== null && player.last_match_at !== undefined && !isIsoDateTime(player.last_match_at)) {
    fail(errors, `${p}.last_match_at`, "must be ISO datetime or null");
  }
  if (player.last_changed_at !== null && player.last_changed_at !== undefined && !isIsoDateTime(player.last_changed_at)) {
    fail(errors, `${p}.last_changed_at`, "must be ISO datetime or null");
  }
  if (
    player.check_interval_days !== null &&
    player.check_interval_days !== undefined &&
    (!Number.isInteger(player.check_interval_days) || player.check_interval_days < 0)
  ) {
    fail(errors, `${p}.check_interval_days`, "must be non-negative integer or null");
  }

  const entityId = String(player.entity_id || "");
  if (seenEntityIds.has(entityId)) {
    fail(errors, `${p}.entity_id`, "duplicate within roster");
  }
  seenEntityIds.add(entityId);
}

function validateProjectFile(filePath, projectCode) {
  const doc = readJson(filePath);
  const errors = [];
  const warnings = [];

  if (doc.schema_version !== "1.0.0") {
    fail(errors, "schema_version", "must be 1.0.0");
  }
  if (!isIsoDateTime(doc.generated_at)) {
    fail(errors, "generated_at", "must be ISO datetime");
  }
  if (typeof doc.project !== "string" || !doc.project.trim()) {
    fail(errors, "project", "must be non-empty string");
  } else if (String(doc.project || "") !== projectCode) {
    warn(warnings, "project", `namespace differs from team code (${projectCode})`);
  }
  if (String(doc.team_code || "") !== projectCode) {
    fail(errors, "team_code", `must equal project code (${projectCode})`);
  }
  if (typeof doc.team_name !== "string" || !doc.team_name.trim()) {
    fail(errors, "team_name", "must be non-empty string");
  }
  if (!Array.isArray(doc.roster)) {
    fail(errors, "roster", "must be array");
  }
  if (!Number.isInteger(doc.roster_count) || doc.roster_count < 0) {
    fail(errors, "roster_count", "must be non-negative integer");
  } else if (Array.isArray(doc.roster) && doc.roster.length !== doc.roster_count) {
    fail(errors, "roster_count", `must equal roster length (${doc.roster.length})`);
  }

  const seenEntityIds = new Set();
  for (let i = 0; i < (doc.roster || []).length; i += 1) {
    validateRosterPlayer(doc.roster[i], projectCode, i, errors, warnings, seenEntityIds);
  }

  return { doc, errors, warnings };
}

function main() {
  if (!fs.existsSync(PROJECTS_DIR)) {
    throw new Error(`Missing projects directory: ${PROJECTS_DIR}`);
  }

  const dirs = fs
    .readdirSync(PROJECTS_DIR, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => entry.name)
    .sort((a, b) => a.localeCompare(b));

  const failures = [];
  const warningRows = [];
  let totalProjects = 0;
  let totalPlayers = 0;

  for (const code of dirs) {
    const filePath = path.join(PROJECTS_DIR, code, `players.${code}.v1.json`);
    if (!fs.existsSync(filePath)) {
      failures.push(`${code}: missing metadata file (${filePath})`);
      continue;
    }
    const { doc, errors, warnings } = validateProjectFile(filePath, code);
    totalProjects += 1;
    totalPlayers += Array.isArray(doc.roster) ? doc.roster.length : 0;
    if (errors.length) {
      failures.push(`${code}: ${errors.join("; ")}`);
    }
    if (warnings.length) {
      warningRows.push(`${code}: ${warnings.join("; ")}`);
    }
  }

  if (failures.length) {
    console.error("Project metadata validation failed:");
    for (const failure of failures) {
      console.error(`- ${failure}`);
    }
    process.exit(1);
  }

  console.log(`OK: ${PROJECTS_DIR}`);
  console.log(`projects: ${totalProjects}`);
  console.log(`players: ${totalPlayers}`);
  if (warningRows.length) {
    console.log("Warnings:");
    for (const row of warningRows) {
      console.log(`- ${row}`);
    }
  }
}

main();
