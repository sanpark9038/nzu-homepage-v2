const fs = require("fs");
const path = require("path");
const {
  buildEloboardEntityId,
  defaultProfileUrlForPlayer,
  getEloboardProfileKind,
} = require("./lib/eloboard-special-cases");

const ROOT = path.resolve(__dirname, "..", "..");

function argValue(flag, fallback = null) {
  const idx = process.argv.indexOf(flag);
  if (idx >= 0 && process.argv[idx + 1]) return process.argv[idx + 1];
  return fallback;
}

function readJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, "utf8").replace(/^\uFEFF/, ""));
}

function writeJson(filePath, data) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, JSON.stringify(data, null, 2), "utf8");
}

function normalizeRace(v) {
  const s = String(v || "").toLowerCase();
  if (s.includes("zerg") || s === "z") return "Zerg";
  if (s.includes("protoss") || s === "p") return "Protoss";
  if (s.includes("terran") || s === "t") return "Terran";
  return "Unknown";
}

function slug(s) {
  return String(s || "")
    .trim()
    .toLowerCase()
    .replace(/[^\w\uac00-\ud7a3]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

function main() {
  const input = argValue("--input");
  const project = argValue("--project");
  const teamCode = (argValue("--team-code", project || "") || "").toLowerCase();
  const teamEn = argValue("--team-en", teamCode.toUpperCase());
  const teamAliasesRaw = argValue("--team-aliases", "");
  const teamEnSlug = slug(teamEn) || teamCode;
  const teamAliases = teamAliasesRaw
    ? teamAliasesRaw
        .split(",")
        .map((v) => v.trim())
        .filter(Boolean)
    : [];

  if (!input || !project) {
    throw new Error(
      "Usage: node scripts/tools/build-project-metadata-from-roster-record.js --input <tmp/*_roster_record_metadata.json> --project <code> [--team-code <code>] [--team-en <EN>]"
    );
  }

  const inPath = path.isAbsolute(input) ? input : path.join(ROOT, input);
  if (!fs.existsSync(inPath)) throw new Error(`Missing input: ${inPath}`);
  const src = readJson(inPath);

  const teamName = String(src.team_name_ko || src.team_name || "");
  const players = Array.isArray(src.players) ? src.players : [];
  const now = new Date().toISOString();

  const roster = players.map((p) => {
    const name = String(p.player_name_ko || p.name || "").trim();
    const wrId = Number(p.wr_id);
    const gender = String(p.gender || "").trim();
    const tier = String(p.tier || "미정").trim() || "미정";
    const race = normalizeRace(p.race);
    const profileUrl = defaultProfileUrlForPlayer({ wr_id: wrId, gender, name });
    return {
      team_name: teamName,
      team_code: teamCode,
      entity_id: buildEloboardEntityId({ wr_id: wrId, gender, name, profile_url: profileUrl }),
      wr_id: wrId,
      gender,
      name,
      profile_url: profileUrl,
      profile_kind: getEloboardProfileKind(profileUrl),
      tier,
      race,
      source: path.basename(inPath),
      meta_tags: [
        "domain:player",
        `project:${project}`,
        `team:${teamCode}`,
        `team_code:${teamCode}`,
        `team_ko:${teamName}`,
        `team_en:${teamEnSlug}`,
        ...teamAliases.map((a) => `team_alias:${slug(a)}`),
        `gender:${gender || "unknown"}`,
      ],
      missing_in_master: false,
    };
  });

  const out = {
    schema_version: "1.0.0",
    generated_at: now,
    project,
    team_name: teamName,
    team_code: teamCode,
    team_name_en: teamEn,
    team_aliases: teamAliases,
    roster_count: roster.length,
    roster,
    source_file: path.relative(ROOT, inPath).replace(/\\/g, "/"),
  };

  const outPath = path.join(ROOT, "data", "metadata", "projects", project, `players.${project}.v1.json`);
  writeJson(outPath, out);
  console.log(`project: ${project}`);
  console.log(`team: ${teamName}`);
  console.log(`output: ${outPath}`);
  console.log(`roster_count: ${roster.length}`);
}

main();
