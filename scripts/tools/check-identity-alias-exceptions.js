const fs = require("fs");
const path = require("path");
const { loadProjectPlayerMetadata, trim } = require("./lib/project-player-metadata");

const ROOT = path.join(__dirname, "..", "..");
const EXCEPTIONS_PATH = path.join(ROOT, "data", "metadata", "identity_alias_exceptions.v1.json");

function readJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, "utf8").replace(/^\uFEFF/, ""));
}

function main() {
  if (!fs.existsSync(EXCEPTIONS_PATH)) {
    throw new Error(`Missing exceptions file: ${EXCEPTIONS_PATH}`);
  }

  const doc = readJson(EXCEPTIONS_PATH);
  const rows = Array.isArray(doc && doc.soop_id_aliases) ? doc.soop_id_aliases : [];
  const metadataRows = loadProjectPlayerMetadata();
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
      entity_id: trim(row && row.entity_id) || null,
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

    const uniqueWrIds = [...new Set(allowedWrIds)];
    if (uniqueWrIds.length !== allowedWrIds.length) {
      issues.push(`${soopId}: allowed_wr_ids contains duplicates`);
    }

    const metadataBucket = (bySoopId.get(soopId) || []).sort((a, b) => a.wr_id - b.wr_id);
    if (!metadataBucket.length) {
      issues.push(`${soopId}: no matching rows in project player metadata`);
      continue;
    }

    const metadataWrIds = [...new Set(metadataBucket.map((item) => item.wr_id))].sort((a, b) => a - b);
    if (metadataWrIds.join(",") !== uniqueWrIds.join(",")) {
      issues.push(
        `${soopId}: allowed_wr_ids=${uniqueWrIds.join(",")} does not match metadata wr_ids=${metadataWrIds.join(",")}`
      );
    }

    const metadataNames = [...new Set(metadataBucket.map((item) => item.name).filter(Boolean))];
    if (uniqueWrIds.length < 2 && metadataNames.length < 2) {
      issues.push(`${soopId}: exception must cover at least 2 wr_ids or 2 metadata names`);
    }

    if (note && metadataNames.length > 1) {
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
