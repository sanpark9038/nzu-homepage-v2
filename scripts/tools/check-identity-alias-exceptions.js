const fs = require("fs");
const path = require("path");

const ROOT = path.join(__dirname, "..", "..");
const EXCEPTIONS_PATH = path.join(ROOT, "data", "metadata", "identity_alias_exceptions.v1.json");
const METADATA_PATH = path.join(ROOT, "scripts", "player_metadata.json");

function readJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, "utf8").replace(/^\uFEFF/, ""));
}

function trim(value) {
  return String(value || "").trim();
}

function main() {
  if (!fs.existsSync(EXCEPTIONS_PATH)) {
    throw new Error(`Missing exceptions file: ${EXCEPTIONS_PATH}`);
  }
  if (!fs.existsSync(METADATA_PATH)) {
    throw new Error(`Missing player metadata: ${METADATA_PATH}`);
  }

  const doc = readJson(EXCEPTIONS_PATH);
  const rows = Array.isArray(doc && doc.soop_id_aliases) ? doc.soop_id_aliases : [];
  const metadataRows = Array.isArray(readJson(METADATA_PATH)) ? readJson(METADATA_PATH) : [];
  const bySoopId = new Map();

  for (const row of metadataRows) {
    const soopId = trim(row && row.soop_user_id).toLowerCase();
    const wrId = Number(row && row.wr_id);
    const name = trim(row && row.name);
    if (!soopId || !Number.isFinite(wrId) || !name) continue;
    const bucket = bySoopId.get(soopId) || [];
    bucket.push({
      wr_id: wrId,
      name,
      gender: trim(row && row.gender) || null,
    });
    bySoopId.set(soopId, bucket);
  }

  const seenSoopIds = new Set();
  const issues = [];

  for (const row of rows) {
    const soopId = trim(row && row.soop_id).toLowerCase();
    const allowedWrIds = Array.isArray(row && row.allowed_wr_ids)
      ? row.allowed_wr_ids.map((value) => Number(value)).filter(Number.isFinite).sort((a, b) => a - b)
      : [];
    const note = trim(row && row.note);

    if (!soopId) {
      issues.push("entry with empty soop_id");
      continue;
    }
    if (seenSoopIds.has(soopId)) {
      issues.push(`${soopId}: duplicated exception entry`);
      continue;
    }
    seenSoopIds.add(soopId);

    if (allowedWrIds.length < 2) {
      issues.push(`${soopId}: allowed_wr_ids must contain at least 2 ids`);
      continue;
    }

    const uniqueWrIds = [...new Set(allowedWrIds)];
    if (uniqueWrIds.length !== allowedWrIds.length) {
      issues.push(`${soopId}: allowed_wr_ids contains duplicates`);
    }

    const metadataBucket = (bySoopId.get(soopId) || []).sort((a, b) => a.wr_id - b.wr_id);
    if (!metadataBucket.length) {
      issues.push(`${soopId}: no matching rows in scripts/player_metadata.json`);
      continue;
    }

    const metadataWrIds = [...new Set(metadataBucket.map((item) => item.wr_id))].sort((a, b) => a - b);
    if (metadataWrIds.join(",") !== uniqueWrIds.join(",")) {
      issues.push(
        `${soopId}: allowed_wr_ids=${uniqueWrIds.join(",")} does not match metadata wr_ids=${metadataWrIds.join(",")}`
      );
    }

    const metadataNames = [...new Set(metadataBucket.map((item) => item.name).filter(Boolean))];
    if (metadataNames.length < 2) {
      issues.push(`${soopId}: metadata rows do not expose multiple names`);
    }

    if (note) {
      const missingNames = metadataNames.filter((name) => !note.includes(name));
      if (missingNames.length) {
        issues.push(`${soopId}: note does not mention metadata names ${missingNames.join(", ")}`);
      }
    }
  }

  if (!issues.length) {
    console.log("PASS identity alias exceptions check");
    console.log(`- checked_exceptions: ${rows.length}`);
    return;
  }

  console.error("FAIL identity alias exceptions check");
  for (const issue of issues) {
    console.error(`- ${issue}`);
  }
  process.exitCode = 1;
}

main();
