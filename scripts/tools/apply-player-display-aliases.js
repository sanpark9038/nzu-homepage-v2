const fs = require("fs");
const path = require("path");

const ROOT = path.resolve(__dirname, "..", "..");
const ALIASES_PATH = path.join(ROOT, "data", "metadata", "player_display_aliases.v1.json");

function argValue(flag, fallback = null) {
  const idx = process.argv.indexOf(flag);
  if (idx >= 0 && process.argv[idx + 1]) return process.argv[idx + 1];
  return fallback;
}

function readJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, "utf8").replace(/^\uFEFF/, ""));
}

function writeJson(filePath, data) {
  fs.writeFileSync(filePath, JSON.stringify(data, null, 2), "utf8");
}

function main() {
  const project = argValue("--project");
  if (!project) {
    throw new Error("Usage: node scripts/tools/apply-player-display-aliases.js --project <code>");
  }
  const filePath = path.join(ROOT, "data", "metadata", "projects", project, `players.${project}.v1.json`);
  if (!fs.existsSync(filePath)) throw new Error(`Missing project metadata: ${filePath}`);
  if (!fs.existsSync(ALIASES_PATH)) throw new Error(`Missing aliases file: ${ALIASES_PATH}`);

  const json = readJson(filePath);
  const aliases = readJson(ALIASES_PATH);
  const rows = (aliases.teams && aliases.teams[project]) || [];
  const byName = new Map(rows.map((r) => [String(r.name), String(r.display_name)]));

  let aliased = 0;
  let passthrough = 0;
  for (const p of json.roster || []) {
    const display = byName.get(String(p.name)) || String(p.name);
    if (display !== p.name) aliased += 1;
    else passthrough += 1;
    p.display_name = display;
    const tags = new Set(Array.isArray(p.meta_tags) ? p.meta_tags : []);
    if (display !== p.name) tags.add("display_alias:true");
    p.meta_tags = [...tags];
  }
  json.generated_at = new Date().toISOString();
  writeJson(filePath, json);
  console.log(
    JSON.stringify(
      {
        project,
        file: filePath,
        roster_count: (json.roster || []).length,
        aliased,
        passthrough,
      },
      null,
      2
    )
  );
}

main();
