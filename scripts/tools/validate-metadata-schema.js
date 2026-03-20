const fs = require("fs");
const path = require("path");

const ROOT = path.resolve(__dirname, "..", "..");
const MASTER_PATH = path.join(ROOT, "data", "metadata", "players.master.v1.json");

function isIsoDateTime(s) {
  return typeof s === "string" && !Number.isNaN(Date.parse(s));
}

function fail(errors, field, message) {
  errors.push(`${field}: ${message}`);
}

function validatePlayer(player, index, errors) {
  const p = `players[${index}]`;
  if (!player || typeof player !== "object") {
    fail(errors, p, "must be an object");
    return;
  }

  if (!/^eloboard:(male|female):\d+$/.test(String(player.entity_id || ""))) {
    fail(errors, `${p}.entity_id`, "invalid format");
  }
  if (player.provider !== "eloboard") {
    fail(errors, `${p}.provider`, "must be eloboard");
  }
  if (!/^\d+$/.test(String(player.provider_player_id || ""))) {
    fail(errors, `${p}.provider_player_id`, "must be numeric string");
  }
  if (!Number.isInteger(player.wr_id) || player.wr_id <= 0) {
    fail(errors, `${p}.wr_id`, "must be positive integer");
  }
  if (!["male", "female"].includes(String(player.gender || ""))) {
    fail(errors, `${p}.gender`, "must be male or female");
  }

  const displayName = player?.names?.display;
  if (typeof displayName !== "string" || !displayName.trim()) {
    fail(errors, `${p}.names.display`, "required non-empty string");
  }
  if (!Array.isArray(player?.names?.aliases)) {
    fail(errors, `${p}.names.aliases`, "must be array");
  }

  const profile = String(player?.profiles?.eloboard || "");
  if (!/^https:\/\/eloboard\.com\/(men|women)\/bbs\/board\.php\?bo_table=bj(_m)?_list&wr_id=\d+$/.test(profile)) {
    fail(errors, `${p}.profiles.eloboard`, "invalid profile URL format");
  }

  if (!isIsoDateTime(player.updated_at)) {
    fail(errors, `${p}.updated_at`, "must be ISO datetime");
  }

  if (player.meta_tags !== undefined) {
    if (!Array.isArray(player.meta_tags)) {
      fail(errors, `${p}.meta_tags`, "must be array when provided");
    } else {
      for (let i = 0; i < player.meta_tags.length; i += 1) {
        const t = String(player.meta_tags[i] || "");
        if (!/^[a-z0-9:_-]+$/.test(t)) {
          fail(errors, `${p}.meta_tags[${i}]`, `invalid tag format (${t})`);
        }
      }
      if (!player.meta_tags.includes("provider:eloboard")) {
        fail(errors, `${p}.meta_tags`, "must include provider:eloboard");
      }
      if (!player.meta_tags.includes(`gender:${player.gender}`)) {
        fail(errors, `${p}.meta_tags`, `must include gender:${player.gender}`);
      }
    }
  }
}

function main() {
  if (!fs.existsSync(MASTER_PATH)) {
    throw new Error(`Missing metadata file: ${MASTER_PATH}`);
  }

  const doc = JSON.parse(fs.readFileSync(MASTER_PATH, "utf8").replace(/^\uFEFF/, ""));
  const errors = [];

  if (doc.schema_version !== "1.0.0") {
    fail(errors, "schema_version", "must be 1.0.0");
  }
  if (!isIsoDateTime(doc.generated_at)) {
    fail(errors, "generated_at", "must be ISO datetime");
  }
  if (doc.primary_key !== "entity_id") {
    fail(errors, "primary_key", "must be entity_id");
  }
  if (!Array.isArray(doc.unique_keys) || doc.unique_keys.length === 0) {
    fail(errors, "unique_keys", "must be non-empty array");
  }
  if (!Array.isArray(doc.players)) {
    fail(errors, "players", "must be array");
  }

  const seenEntityId = new Set();
  const seenComposite = new Set();
  for (let i = 0; i < (doc.players || []).length; i += 1) {
    const player = doc.players[i];
    validatePlayer(player, i, errors);

    const entityId = String(player?.entity_id || "");
    if (seenEntityId.has(entityId)) fail(errors, `players[${i}].entity_id`, "duplicate");
    seenEntityId.add(entityId);

    const composite = `${player?.wr_id}:${player?.gender}`;
    if (seenComposite.has(composite)) fail(errors, `players[${i}]`, `duplicate wr_id+gender (${composite})`);
    seenComposite.add(composite);
  }

  if (errors.length > 0) {
    console.error("Metadata schema validation failed:");
    for (const e of errors) console.error(`- ${e}`);
    process.exit(1);
  }

  console.log(`OK: ${MASTER_PATH}`);
  console.log(`players: ${doc.players.length}`);
}

main();
