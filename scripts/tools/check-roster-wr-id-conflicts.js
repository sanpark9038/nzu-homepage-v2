const fs = require("fs");
const path = require("path");

const ROOT = path.join(__dirname, "..", "..");
const PROJECTS_DIR = path.join(ROOT, "data", "metadata", "projects");

function readJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, "utf8").replace(/^\uFEFF/, ""));
}

function trim(value) {
  return String(value || "").trim();
}

function normalizeName(value) {
  return trim(value).replace(/\s+/g, " ");
}

function main() {
  const entriesByIdentity = new Map();
  const projectDirs = fs
    .readdirSync(PROJECTS_DIR, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => entry.name);

  for (const code of projectDirs) {
    const filePath = path.join(PROJECTS_DIR, code, `players.${code}.v1.json`);
    if (!fs.existsSync(filePath)) continue;
    const doc = readJson(filePath);
    const roster = Array.isArray(doc && doc.roster) ? doc.roster : [];
    for (const row of roster) {
      const wrId = Number(row && row.wr_id);
      const entityId = trim(row && row.entity_id);
      const identityKey = entityId || (Number.isFinite(wrId) ? `wr_id:${wrId}` : "");
      if (!identityKey) continue;
      const bucket = entriesByIdentity.get(identityKey) || [];
      bucket.push({
        wr_id: Number.isFinite(wrId) ? wrId : null,
        team_code: trim(doc && doc.team_code) || code,
        team_name: trim(doc && doc.team_name) || code,
        entity_id: entityId || null,
        name: normalizeName(row && row.name) || null,
        display_name: normalizeName(row && row.display_name) || null,
      });
      entriesByIdentity.set(identityKey, bucket);
    }
  }

  const conflicts = [];
  for (const [identityKey, bucket] of entriesByIdentity.entries()) {
    const canonicalNames = [...new Set(bucket.map((row) => row.name).filter(Boolean))];
    if (canonicalNames.length > 1) {
      conflicts.push({
        identity_key: identityKey,
        reason: "multiple canonical roster names",
        rows: bucket,
      });
      continue;
    }

    const displayNames = [...new Set(bucket.map((row) => row.display_name).filter(Boolean))];
    if (displayNames.length > 1) {
      conflicts.push({
        identity_key: identityKey,
        reason: "multiple display roster names",
        rows: bucket,
      });
    }
  }

  if (!conflicts.length) {
    console.log("PASS roster wr_id collision check");
    console.log(`- checked_identity_keys: ${entriesByIdentity.size}`);
    return;
  }

  console.error("FAIL roster wr_id collision check");
  for (const conflict of conflicts.sort((a, b) => String(a.identity_key).localeCompare(String(b.identity_key)))) {
    console.error(`- identity=${conflict.identity_key} reason=${conflict.reason}`);
    for (const row of conflict.rows) {
      console.error(
        `  team=${row.team_code} wr_id=${row.wr_id ?? "-"} name=${row.name || "-"} display_name=${row.display_name || "-"} entity_id=${row.entity_id || "-"}`
      );
    }
  }
  process.exitCode = 1;
}

main();
