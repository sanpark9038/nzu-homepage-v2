const fs = require("fs");
const path = require("path");
const {
  buildEloboardEntityId,
  defaultProfileUrlForPlayer,
  getEloboardProfileKind,
} = require("./lib/eloboard-special-cases");

const ROOT = path.resolve(__dirname, "..", "..");
const IN_PATH = path.join(ROOT, "tmp", "와플대_roster_record_metadata.json");
const OUT_PATH = path.join(ROOT, "data", "metadata", "projects", "wfu", "players.wfu.v1.json");

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

function main() {
  if (!fs.existsSync(IN_PATH)) {
    throw new Error(`Missing input: ${IN_PATH}`);
  }

  const src = readJson(IN_PATH);
  const players = Array.isArray(src.players) ? src.players : [];
  const now = new Date().toISOString();

  const roster = players.map((p) => {
    const name = String(p.player_name_ko || "").trim();
    const wrId = Number(p.wr_id);
    const gender = String(p.gender || "").trim();
    const tier = String(p.tier || "미정").trim() || "미정";
    const race = normalizeRace(p.race);
    const profileUrl = defaultProfileUrlForPlayer({ wr_id: wrId, gender, name });
    return {
      team_name: "와플대",
      team_code: "wfu",
      entity_id: buildEloboardEntityId({ wr_id: wrId, gender, name, profile_url: profileUrl }),
      wr_id: wrId,
      gender,
      name,
      profile_url: profileUrl,
      profile_kind: getEloboardProfileKind(profileUrl),
      tier,
      race,
      source: "wfu_roster_record_metadata",
      meta_tags: [
        "domain:player",
        "project:wfu-validation",
        "team:wfu",
        "team_code:wfu",
        "team_ko:와플대",
        "team_en:wfu",
        `gender:${gender || "unknown"}`,
      ],
      missing_in_master: false,
    };
  });

  const out = {
    schema_version: "1.0.0",
    generated_at: now,
    project: "wfu-validation",
    team_name: "와플대",
    team_code: "wfu",
    team_name_en: "WFU",
    roster_count: roster.length,
    roster,
    source_file: path.relative(ROOT, IN_PATH).replace(/\\/g, "/"),
  };

  writeJson(OUT_PATH, out);
  console.log(`wfu: ${OUT_PATH}`);
  console.log(`roster_count: ${roster.length}`);
}

main();
