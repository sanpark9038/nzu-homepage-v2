const fs = require("fs");
const path = require("path");

const ROOT = path.resolve(__dirname, "..", "..");
const PLAYER_METADATA_PATH = path.join(ROOT, "scripts", "player_metadata.json");
const SOOP_MAPPINGS_PATH = path.join(ROOT, "data", "metadata", "soop_channel_mappings.v1.json");
const REPORT_PATH = path.join(ROOT, "tmp", "soop_channel_mapping_report.json");

function readJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, "utf8").replace(/^\uFEFF/, ""));
}

function writeJson(filePath, value) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, JSON.stringify(value, null, 2), "utf8");
}

function normalizeName(value) {
  return String(value || "").trim();
}

function main() {
  const write = process.argv.includes("--write");
  const mappingsDoc = readJson(SOOP_MAPPINGS_PATH);
  const metadata = readJson(PLAYER_METADATA_PATH);

  if (!Array.isArray(metadata)) {
    throw new Error("scripts/player_metadata.json must be an array");
  }

  const aliases = mappingsDoc && typeof mappingsDoc.aliases === "object" ? mappingsDoc.aliases : {};
  const mappings = Array.isArray(mappingsDoc && mappingsDoc.mappings) ? mappingsDoc.mappings : [];
  const byName = new Map(metadata.map((row) => [normalizeName(row && row.name), row]));

  const matched = [];
  const unresolved = [];
  const conflicts = [];

  for (const mapping of mappings) {
    const rawName = normalizeName(mapping && mapping.name);
    const soopUserId = String(mapping && mapping.soop_user_id ? mapping.soop_user_id : "").trim();
    if (!rawName || !soopUserId) continue;

    const canonicalName = normalizeName(aliases[rawName] || rawName);
    const row = byName.get(canonicalName);
    if (!row) {
      unresolved.push({
        source_name: rawName,
        canonical_name: canonicalName,
        soop_user_id: soopUserId,
        source: String(mapping && mapping.source ? mapping.source : ""),
      });
      continue;
    }

    const existing = String(row.soop_user_id || "").trim();
    if (existing && existing !== soopUserId) {
      conflicts.push({
        canonical_name: canonicalName,
        existing_soop_user_id: existing,
        incoming_soop_user_id: soopUserId,
        source_name: rawName,
        source: String(mapping && mapping.source ? mapping.source : ""),
      });
      continue;
    }

    row.soop_user_id = soopUserId;
    matched.push({
      canonical_name: canonicalName,
      source_name: rawName,
      wr_id: row.wr_id,
      gender: row.gender,
      soop_user_id: soopUserId,
      source: String(mapping && mapping.source ? mapping.source : ""),
    });
  }

  metadata.sort((a, b) => Number(a.wr_id) - Number(b.wr_id));

  const report = {
    generated_at: new Date().toISOString(),
    source_path: SOOP_MAPPINGS_PATH,
    player_metadata_path: PLAYER_METADATA_PATH,
    totals: {
      mapping_rows: mappings.length,
      matched: matched.length,
      unresolved: unresolved.length,
      conflicts: conflicts.length,
    },
    matched,
    unresolved,
    conflicts,
  };

  writeJson(REPORT_PATH, report);

  if (write) {
    writeJson(PLAYER_METADATA_PATH, metadata);
    console.log(`Applied SOOP channel mappings.`);
    console.log(`- Updated: ${PLAYER_METADATA_PATH}`);
  } else {
    console.log(`Dry-run only. Use --write to apply.`);
  }
  console.log(`- Report: ${REPORT_PATH}`);
  console.log(`- Matched: ${matched.length}`);
  console.log(`- Unresolved: ${unresolved.length}`);
  console.log(`- Conflicts: ${conflicts.length}`);
}

main();
