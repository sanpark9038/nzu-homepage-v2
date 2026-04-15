const fs = require("fs");
const path = require("path");
const { execFileSync } = require("child_process");

const ROOT = path.resolve(__dirname, "..", "..");
const ROLE_OVERRIDES_PATH = path.join(ROOT, "data", "metadata", "team_role_overrides.v1.json");
const DISPLAY_ALIASES_PATH = path.join(ROOT, "data", "metadata", "player_display_aliases.v1.json");

function argValue(flag, fallback = null) {
  const idx = process.argv.indexOf(flag);
  if (idx >= 0 && process.argv[idx + 1]) return process.argv[idx + 1];
  return fallback;
}

function hasFlag(flag) {
  return process.argv.includes(flag);
}

function readJson(filePath, fallback = null) {
  if (!fs.existsSync(filePath)) return fallback;
  return JSON.parse(fs.readFileSync(filePath, "utf8").replace(/^\uFEFF/, ""));
}

function writeJson(filePath, data) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, JSON.stringify(data, null, 2), "utf8");
}

function runNode(scriptPath, args) {
  return execFileSync("node", [scriptPath, ...args], {
    cwd: ROOT,
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
  }).trim();
}

function makeTeamSlug(name) {
  const slug = String(name || "")
    .replace(/[^\w\uAC00-\uD7A3]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .toLowerCase();
  if (slug) return slug;
  return encodeURIComponent(String(name || "")).toLowerCase();
}

function parseChairs(raw) {
  if (!raw) return [];
  return String(raw)
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean)
    .map((row, idx) => {
      const [nameRaw, titleRaw, prioRaw] = row.split(":").map((v) => String(v || "").trim());
      const name = nameRaw;
      const role_title = titleRaw || "이사장";
      const role_priority = Number.isFinite(Number(prioRaw)) ? Number(prioRaw) : idx + 1;
      return { name, role_title, role_priority };
    })
    .filter((r) => r.name);
}

function parseAliases(raw) {
  if (!raw) return [];
  return String(raw)
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean)
    .map((row) => {
      const eq = row.indexOf("=");
      if (eq < 0) return null;
      const name = row.slice(0, eq).trim();
      const display_name = row.slice(eq + 1).trim();
      if (!name || !display_name) return null;
      return { name, display_name };
    })
    .filter(Boolean);
}

function upsertRoleOverrides(project, chairs) {
  if (!chairs.length) return { updated: false, count: 0 };
  const doc =
    readJson(ROLE_OVERRIDES_PATH, {
      schema_version: "1.0.0",
      updated_at: new Date().toISOString(),
      description: "Team-specific role priority overrides for roster ordering.",
      teams: {},
    }) || {};
  if (!doc.teams || typeof doc.teams !== "object") doc.teams = {};
  doc.teams[project] = chairs;
  doc.updated_at = new Date().toISOString();
  writeJson(ROLE_OVERRIDES_PATH, doc);
  return { updated: true, count: chairs.length };
}

function upsertDisplayAliases(project, aliases) {
  if (!aliases.length) return { updated: false, count: 0 };
  const doc =
    readJson(DISPLAY_ALIASES_PATH, {
      schema_version: "1.0.0",
      updated_at: new Date().toISOString(),
      description: "Homepage display aliases. Match data collection should keep canonical player name.",
      teams: {},
    }) || {};
  if (!doc.teams || typeof doc.teams !== "object") doc.teams = {};
  doc.teams[project] = aliases;
  doc.updated_at = new Date().toISOString();
  writeJson(DISPLAY_ALIASES_PATH, doc);
  return { updated: true, count: aliases.length };
}

function main() {
  const univ = String(argValue("--univ", "") || "").trim();
  const project = String(argValue("--project", "") || "").trim().toLowerCase();
  const teamCode = String(argValue("--team-code", project) || project).trim().toLowerCase();
  const teamEn = String(argValue("--team-en", teamCode.toUpperCase()) || "").trim();
  const teamAliases = String(argValue("--team-aliases", "") || "").trim();
  const chairs = parseChairs(argValue("--chairs", ""));
  const aliases = parseAliases(argValue("--aliases", ""));
  const skipFetch = hasFlag("--skip-fetch");
  const skipEnrich = hasFlag("--skip-enrich");

  if (!univ || !project) {
    throw new Error(
      "Usage: node scripts/tools/onboard-team.js --univ <teamName> --project <code> [--team-en <EN>] [--team-aliases a,b] [--chairs name:title:priority,...] [--aliases name=display,...]"
    );
  }

  const exportScript = path.join(ROOT, "scripts", "tools", "export-team-roster-metadata.js");
  const buildProjectScript = path.join(ROOT, "scripts", "tools", "build-project-metadata-from-roster-record.js");
  const enrichScript = path.join(ROOT, "scripts", "tools", "enrich-team-metadata.js");
  const orderScript = path.join(ROOT, "scripts", "tools", "apply-team-roster-order.js");
  const displayAliasScript = path.join(ROOT, "scripts", "tools", "apply-player-display-aliases.js");
  const tableScript = path.join(ROOT, "scripts", "tools", "report-team-roster-table.js");

  let recordPath = path.join(ROOT, "tmp", `${makeTeamSlug(univ)}_roster_record_metadata.json`);
  const logs = [];

  if (!skipFetch) {
    runNode(exportScript, ["--univ", univ]);
    logs.push("export_done");
  } else if (!fs.existsSync(recordPath)) {
    throw new Error(`Missing record file for --skip-fetch: ${recordPath}`);
  }

  runNode(buildProjectScript, [
    "--input",
    path.relative(ROOT, recordPath).replace(/\\/g, "/"),
    "--project",
    project,
    "--team-code",
    teamCode,
    "--team-en",
    teamEn,
    "--team-aliases",
    teamAliases || univ,
  ]);
  logs.push("build_project_done");

  if (!skipEnrich) {
    runNode(enrichScript, ["--project", project, "--team", univ]);
    logs.push("enrich_done");
  }

  const roleResult = upsertRoleOverrides(project, chairs);
  const aliasResult = upsertDisplayAliases(project, aliases);
  if (roleResult.updated) logs.push("role_overrides_updated");
  if (aliasResult.updated) logs.push("display_aliases_updated");

  runNode(orderScript, ["--project", project]);
  logs.push("order_done");

  runNode(displayAliasScript, ["--project", project]);
  logs.push("display_apply_done");

  const table = runNode(tableScript, ["--team-code", project]);
  const out = {
    ok: true,
    project,
    univ,
    team_code: teamCode,
    team_en: teamEn,
    record_path: path.relative(ROOT, recordPath).replace(/\\/g, "/"),
    role_overrides: roleResult,
    display_aliases: aliasResult,
    steps: logs,
    preview_markdown: table,
  };
  console.log(JSON.stringify(out, null, 2));
}

main();
