const fs = require("fs");
const path = require("path");
const { defaultProfileUrlForPlayer } = require("./lib/eloboard-special-cases");

const ROOT = path.resolve(__dirname, "..", "..");
const SOURCE_PATH = path.join(ROOT, "scripts", "player_metadata.json");
const OUT_DIR = path.join(ROOT, "data", "metadata");
const MASTER_OUT_PATH = path.join(OUT_DIR, "players.master.v1.json");
const NZU_OUT_PATH = path.join(OUT_DIR, "projects", "nzu", "players.nzu.v1.json");
const REPORT_OUT_PATH = path.join(ROOT, "tmp", "metadata_db_build_report.json");

const NZU_ROSTER_SEED = {
  team_name: "늪지대",
  team_code: "nzu",
  team_name_en: "NZU",
  players: [
    { name: "쌍디", wr_id: 671, gender: "female", tier: "6", race: "Zerg" },
    { name: "인치호", wr_id: 150, gender: "male", tier: "조커", race: "Zerg" },
    { name: "전흥식", wr_id: 100, gender: "male", tier: "조커", race: "Protoss" },
    { name: "김성제", wr_id: 207, gender: "male", tier: "스페이드", race: "Protoss" },
    { name: "서기수", wr_id: 208, gender: "male", tier: "스페이드", race: "Protoss" },
    { name: "애공", wr_id: 223, gender: "female", tier: "1", race: "Protoss" },
    { name: "슬아", wr_id: 57, gender: "female", tier: "4", race: "Zerg" },
    { name: "슈슈", wr_id: 668, gender: "female", tier: "5", race: "Zerg" },
    { name: "예실", wr_id: 846, gender: "female", tier: "5", race: "Protoss" },
    { name: "연블비", wr_id: 627, gender: "female", tier: "6", race: "Zerg" },
    { name: "다라츄", wr_id: 927, gender: "female", tier: "8", race: "Zerg" },
    { name: "아링", wr_id: 953, gender: "female", tier: "8", race: "Protoss" },
    { name: "정연이", wr_id: 424, gender: "female", tier: "8", race: "Protoss" },
    { name: "지아송", wr_id: 981, gender: "female", tier: "8", race: "Protoss" },
  ],
};

function slugifyTier(tier) {
  const raw = String(tier || "").trim();
  const map = {
    갓: "god",
    킹: "king",
    잭: "jack",
    조커: "joker",
    스페이드: "spade",
    유스: "baby",
    베이비: "baby",
    미정: "unknown",
  };
  if (raw === "9") return "baby";
  if (map[raw]) return map[raw];
  if (/^\d+$/.test(raw)) return raw;
  return raw.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "") || "unknown";
}

function slugifyRace(race) {
  const r = String(race || "").toLowerCase();
  if (r.includes("zerg") || r === "z") return "zerg";
  if (r.includes("protoss") || r === "p") return "protoss";
  if (r.includes("terran") || r === "t") return "terran";
  return "unknown";
}

function readJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, "utf8").replace(/^\uFEFF/, ""));
}

function writeJson(filePath, obj) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, JSON.stringify(obj, null, 2), "utf8");
}

function compositeKey(wrId, gender) {
  return `${wrId}:${gender}`;
}

function profileUrl(gender, wrId, name = "") {
  return defaultProfileUrlForPlayer({
    gender,
    wr_id: wrId,
    name,
  });
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
    const r = rows[i];
    if (!r || typeof r.wr_id !== "number" || !r.name || !r.gender) {
      invalidRows.push({ index: i, row: r });
      continue;
    }
    const key = compositeKey(r.wr_id, String(r.gender));
    if (!nameSetByComposite.has(key)) nameSetByComposite.set(key, new Set());
    nameSetByComposite.get(key).add(String(r.name));

    if (byComposite.has(key)) {
      duplicateRows.push({
        key,
        prev: byComposite.get(key),
        next: r,
      });
    }
    byComposite.set(key, r);

    const wr = r.wr_id;
    if (!genderConflictsByWrId.has(wr)) genderConflictsByWrId.set(wr, new Set());
    genderConflictsByWrId.get(wr).add(String(r.gender));
  }

  const nzuKeySet = new Set(
    NZU_ROSTER_SEED.players.map((p) => compositeKey(p.wr_id, p.gender))
  );

  const masterPlayers = [...byComposite.values()]
    .map((r) => {
      const key = compositeKey(r.wr_id, r.gender);
      const aliases = [...(nameSetByComposite.get(key) || new Set())].filter((n) => n !== r.name);
      const isNzu = nzuKeySet.has(key);
      return {
        entity_id: `eloboard:${r.gender}:${r.wr_id}`,
        provider: "eloboard",
        provider_player_id: String(r.wr_id),
        wr_id: r.wr_id,
        gender: r.gender,
        names: {
          display: r.name,
          aliases,
        },
        profiles: {
          eloboard: profileUrl(r.gender, r.wr_id, r.name),
        },
        source: {
          kind: "manual_or_scraped_mapping",
          origin_file: "scripts/player_metadata.json",
        },
        meta_tags: [
          "domain:player",
          "provider:eloboard",
          `gender:${r.gender}`,
          "identity:verified",
          ...(isNzu
            ? ["team:nzu", "team_code:nzu", "team_ko:늪지대", "team_en:nzu"]
            : []),
        ],
        updated_at: now,
      };
    })
    .sort((a, b) => {
      const idDiff = a.wr_id - b.wr_id;
      if (idDiff !== 0) return idDiff;
      return a.gender.localeCompare(b.gender);
    });

  const master = {
    schema_version: "1.0.0",
    generated_at: now,
    description: "Reusable master metadata DB for Eloboard player identity mapping.",
    primary_key: "entity_id",
    unique_keys: ["entity_id", "wr_id+gender"],
    players: masterPlayers,
  };

  const masterIndex = new Map(masterPlayers.map((p) => [compositeKey(p.wr_id, p.gender), p]));
  const nzuRoster = NZU_ROSTER_SEED.players.map((p) => {
    const key = compositeKey(p.wr_id, p.gender);
    const hit = masterIndex.get(key);
    return {
      team_name: NZU_ROSTER_SEED.team_name,
      entity_id: hit ? hit.entity_id : null,
      wr_id: p.wr_id,
      gender: p.gender,
      name: hit ? hit.names.display : p.name,
      tier: p.tier,
      race: p.race,
      source: "nzu_seed_roster",
      meta_tags: [
        "domain:player",
        "project:nzu-homepage",
        "team:nzu",
        "team_code:nzu",
        "team_ko:늪지대",
        "team_en:nzu",
        `gender:${p.gender}`,
        `race:${slugifyRace(p.race)}`,
        `tier:${slugifyTier(p.tier)}`,
      ],
      missing_in_master: !hit,
    };
  });

  const nzu = {
    schema_version: "1.0.0",
    generated_at: now,
    project: "nzu-homepage",
    team_name: NZU_ROSTER_SEED.team_name,
    team_code: NZU_ROSTER_SEED.team_code,
    team_name_en: NZU_ROSTER_SEED.team_name_en,
    roster_count: nzuRoster.length,
    roster: nzuRoster,
  };

  const wrIdGenderConflictCount = [...genderConflictsByWrId.entries()].filter(([, g]) => g.size > 1).length;
  const sameNameCrossGenderConflictCount = [...genderConflictsByWrId.entries()].filter(([wrId, g]) => {
    if (g.size <= 1) return false;
    const rowsForWrId = rows.filter((r) => Number(r.wr_id) === Number(wrId));
    const male = new Set(rowsForWrId.filter((r) => r.gender === "male").map((r) => String(r.name || "")));
    const female = new Set(rowsForWrId.filter((r) => r.gender === "female").map((r) => String(r.name || "")));
    return [...male].some((n) => female.has(n));
  }).length;

  const report = {
    generated_at: now,
    source_rows: rows.length,
    valid_composite_rows: byComposite.size,
    invalid_rows: invalidRows.length,
    duplicate_composite_rows: duplicateRows.length,
    wr_id_cross_gender_overlap_count: wrIdGenderConflictCount,
    wr_id_gender_conflict_count: sameNameCrossGenderConflictCount,
    nzu_missing_in_master_count: nzuRoster.filter((r) => r.missing_in_master).length,
  };

  writeJson(MASTER_OUT_PATH, master);
  writeJson(NZU_OUT_PATH, nzu);
  writeJson(REPORT_OUT_PATH, report);

  console.log(`master: ${MASTER_OUT_PATH}`);
  console.log(`nzu: ${NZU_OUT_PATH}`);
  console.log(`report: ${REPORT_OUT_PATH}`);
  console.log(`players(master): ${masterPlayers.length}`);
}

main();
