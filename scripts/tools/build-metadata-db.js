const fs = require("fs");
const path = require("path");
const {
  buildEloboardCompositeKey,
  buildEloboardEntityId,
  defaultProfileUrlForPlayer,
  getEloboardProfileKind,
} = require("./lib/eloboard-special-cases");

const ROOT = path.resolve(__dirname, "..", "..");
const SOURCE_PATH = path.join(ROOT, "scripts", "player_metadata.json");
const OUT_DIR = path.join(ROOT, "data", "metadata");
const MASTER_OUT_PATH = path.join(OUT_DIR, "players.master.v1.json");
const REPORT_OUT_PATH = path.join(ROOT, "tmp", "metadata_db_build_report.json");

function readJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, "utf8").replace(/^\uFEFF/, ""));
}

function writeJson(filePath, obj) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, JSON.stringify(obj, null, 2), "utf8");
}

function profileUrl(gender, wrId, name = "") {
  return defaultProfileUrlForPlayer({
    gender,
    wr_id: wrId,
    name,
  });
}

function soopChannelUrl(soopUserId) {
  const value = String(soopUserId || "").trim();
  return value ? `https://ch.sooplive.co.kr/${value}` : null;
}

function main() {
  if (!fs.existsSync(SOURCE_PATH)) {
    throw new Error(`Missing source: ${SOURCE_PATH}`);
  }

  const now = new Date().toISOString();
  const rows = readJson(SOURCE_PATH);
  if (!Array.isArray(rows)) {
    throw new Error("scripts/player_metadata.json must be an array");
  }

  const invalidRows = [];
  const byComposite = new Map();
  const duplicateRows = [];
  const genderConflictsByWrId = new Map();
  const nameSetByComposite = new Map();

  for (let i = 0; i < rows.length; i += 1) {
    const row = rows[i];
    if (!row || typeof row.wr_id !== "number" || !row.name || !row.gender) {
      invalidRows.push({ index: i, row });
      continue;
    }

    const key = buildEloboardCompositeKey(row);
    if (!nameSetByComposite.has(key)) nameSetByComposite.set(key, new Set());
    nameSetByComposite.get(key).add(String(row.name));

    if (byComposite.has(key)) {
      duplicateRows.push({
        key,
        prev: byComposite.get(key),
        next: row,
      });
    }
    byComposite.set(key, row);

    const wrId = row.wr_id;
    if (!genderConflictsByWrId.has(wrId)) genderConflictsByWrId.set(wrId, new Set());
    genderConflictsByWrId.get(wrId).add(String(row.gender));
  }

  const masterPlayers = [...byComposite.values()]
    .map((row) => {
      const key = buildEloboardCompositeKey(row);
      const profile = profileUrl(row.gender, row.wr_id, row.name);
      const aliases = [...(nameSetByComposite.get(key) || new Set())].filter((name) => name !== row.name);
      return {
        entity_id: buildEloboardEntityId({ ...row, profile_url: profile }),
        provider: "eloboard",
        provider_player_id: String(row.wr_id),
        wr_id: row.wr_id,
        gender: row.gender,
        soop_user_id: String(row.soop_user_id || "").trim() || undefined,
        profile_kind: getEloboardProfileKind(profile),
        names: {
          display: row.name,
          aliases,
        },
        profiles: {
          eloboard: profile,
          ...(soopChannelUrl(row.soop_user_id) ? { soop: soopChannelUrl(row.soop_user_id) } : {}),
        },
        source: {
          kind: "manual_or_scraped_mapping",
          origin_file: "scripts/player_metadata.json",
        },
        meta_tags: [
          "domain:player",
          "provider:eloboard",
          `gender:${row.gender}`,
          "identity:verified",
        ],
        updated_at: now,
      };
    })
    .sort((a, b) => {
      const wrIdDiff = a.wr_id - b.wr_id;
      if (wrIdDiff !== 0) return wrIdDiff;
      return a.gender.localeCompare(b.gender);
    });

  const master = {
    schema_version: "1.0.0",
    generated_at: now,
    description: "Reusable master metadata DB for Eloboard player identity mapping.",
    primary_key: "entity_id",
    unique_keys: ["entity_id", "wr_id+gender+profile_kind"],
    players: masterPlayers,
  };

  const wrIdGenderConflictCount = [...genderConflictsByWrId.entries()].filter(([, genders]) => genders.size > 1).length;
  const sameNameCrossGenderConflictCount = [...genderConflictsByWrId.entries()].filter(([wrId, genders]) => {
    if (genders.size <= 1) return false;
    const rowsForWrId = rows.filter((row) => Number(row.wr_id) === Number(wrId));
    const male = new Set(rowsForWrId.filter((row) => row.gender === "male").map((row) => String(row.name || "")));
    const female = new Set(rowsForWrId.filter((row) => row.gender === "female").map((row) => String(row.name || "")));
    return [...male].some((name) => female.has(name));
  }).length;

  const report = {
    generated_at: now,
    source_rows: rows.length,
    valid_composite_rows: byComposite.size,
    invalid_rows: invalidRows.length,
    duplicate_composite_rows: duplicateRows.length,
    wr_id_cross_gender_overlap_count: wrIdGenderConflictCount,
    wr_id_gender_conflict_count: sameNameCrossGenderConflictCount,
  };

  writeJson(MASTER_OUT_PATH, master);
  writeJson(REPORT_OUT_PATH, report);

  console.log(`master: ${MASTER_OUT_PATH}`);
  console.log(`report: ${REPORT_OUT_PATH}`);
  console.log(`players(master): ${masterPlayers.length}`);
}

main();
