const fs = require("fs");
const path = require("path");
const assert = require("node:assert/strict");

const ROOT = path.resolve(__dirname, "..", "..");
const OVERRIDES_PATH = path.join(ROOT, "data", "metadata", "roster_manual_overrides.v1.json");
const PLAYER_METADATA_PATH = path.join(ROOT, "scripts", "player_metadata.json");

function readJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, "utf8").replace(/^\uFEFF/, ""));
}

function runTest(name, fn) {
  try {
    fn();
    console.log(`PASS ${name}`);
  } catch (error) {
    console.error(`FAIL ${name}`);
    throw error;
  }
}

function parseEntityId(entityId) {
  const match = String(entityId || "").match(/^eloboard:(male|female):(\d+)$/i);
  if (!match) return null;
  return {
    gender: match[1].toLowerCase(),
    wrId: Number(match[2]),
  };
}

runTest("manual roster overrides do not replace known player metadata names with placeholders", () => {
  const overridesDoc = readJson(OVERRIDES_PATH);
  const metadataRows = readJson(PLAYER_METADATA_PATH);
  const metadataByIdentity = new Map(
    metadataRows
      .filter((row) => Number.isFinite(Number(row.wr_id)) && row.gender && row.name)
      .map((row) => [`${String(row.gender).toLowerCase()}:${Number(row.wr_id)}`, String(row.name).trim()])
  );

  for (const row of Array.isArray(overridesDoc.overrides) ? overridesDoc.overrides : []) {
    const parsed = parseEntityId(row && row.entity_id);
    if (!parsed || !row.name) continue;

    const expectedName = metadataByIdentity.get(`${parsed.gender}:${parsed.wrId}`);
    if (!expectedName) continue;

    assert.notEqual(
      String(row.name).trim(),
      "??",
      `${row.entity_id} manual override must not publish placeholder name when metadata has ${expectedName}`
    );
  }
});
