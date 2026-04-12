const fs = require("fs");
const path = require("path");

const ROOT = path.join(__dirname, "..", "..");
const METADATA_PATH = path.join(ROOT, "scripts", "player_metadata.json");
const EXCEPTIONS_PATH = path.join(ROOT, "data", "metadata", "identity_alias_exceptions.v1.json");

function readJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, "utf8").replace(/^\uFEFF/, ""));
}

function trim(value) {
  return String(value || "").trim();
}

function readExceptions() {
  if (!fs.existsSync(EXCEPTIONS_PATH)) return new Map();
  const doc = readJson(EXCEPTIONS_PATH);
  const lookup = new Map();
  const aliasRows = Array.isArray(doc && doc.soop_id_aliases) ? doc.soop_id_aliases : [];
  for (const row of aliasRows) {
    const soopId = trim(row && row.soop_id).toLowerCase();
    const wrIds = Array.isArray(row && row.allowed_wr_ids)
      ? row.allowed_wr_ids.map((value) => Number(value)).filter(Number.isFinite).sort((a, b) => a - b)
      : [];
    if (!soopId || !wrIds.length) continue;
    lookup.set(soopId, wrIds.join(","));
  }
  return lookup;
}

function main() {
  const rows = readJson(METADATA_PATH);
  if (!Array.isArray(rows)) {
    throw new Error("scripts/player_metadata.json must be an array");
  }

  const bySoopId = new Map();
  const exceptionLookup = readExceptions();
  for (const row of rows) {
    const soopId = trim(row && row.soop_user_id).toLowerCase();
    if (!soopId) continue;
    const bucket = bySoopId.get(soopId) || [];
    bucket.push({
      wr_id: Number(row && row.wr_id),
      gender: trim(row && row.gender) || null,
      name: trim(row && row.name) || null,
    });
    bySoopId.set(soopId, bucket);
  }

  const conflicts = [];
  for (const [soopId, bucket] of bySoopId.entries()) {
    const identityKeys = [...new Set(bucket.map((row) => `${row.wr_id}:${row.gender}:${row.name}`))];
    if (identityKeys.length <= 1) continue;
    const wrIdKey = [...new Set(bucket.map((row) => row.wr_id).filter(Number.isFinite))].sort((a, b) => a - b).join(",");
    if (exceptionLookup.get(soopId) === wrIdKey) continue;
    conflicts.push({
      soop_id: soopId,
      rows: bucket.sort((a, b) => a.wr_id - b.wr_id),
    });
  }

  if (!conflicts.length) {
    console.log("PASS soop_id collision check");
    console.log(`- checked_soop_ids: ${bySoopId.size}`);
    return;
  }

  console.error("FAIL soop_id collision check");
  for (const conflict of conflicts) {
    console.error(`- ${conflict.soop_id}`);
    for (const row of conflict.rows) {
      console.error(`  wr_id=${row.wr_id} gender=${row.gender || "-"} name=${row.name || "-"}`);
    }
  }
  process.exitCode = 1;
}

main();
