const fs = require("fs");
const path = require("path");
require("dotenv").config({ path: path.join(__dirname, "..", "..", ".env.local"), quiet: true });
const { SOOP_BROAD_LIST_URL, trim, fetchLiveRowsByIds } = require("./lib/soop-open-api");

const ROOT = path.resolve(__dirname, "..", "..");
const PLAYER_METADATA_PATH = path.join(ROOT, "scripts", "player_metadata.json");
const OUTPUT_PATH = path.join(ROOT, "data", "metadata", "soop_live_snapshot.generated.v1.json");
const SOOP_CLIENT_ID = String(process.env.SOOP_CLIENT_ID || "").trim();
const DEFAULT_PAGE_LIMIT = 60;

function readJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, "utf8").replace(/^\uFEFF/, ""));
}

function writeJson(filePath, value) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, JSON.stringify(value, null, 2), "utf8");
}

function argValue(flag, fallback = "") {
  const index = process.argv.indexOf(flag);
  if (index >= 0 && process.argv[index + 1]) return process.argv[index + 1];
  return fallback;
}

function toNumber(value, fallback) {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

function loadMetadataTargets() {
  if (!fs.existsSync(PLAYER_METADATA_PATH)) {
    throw new Error(`Missing file: ${PLAYER_METADATA_PATH}`);
  }
  const rows = readJson(PLAYER_METADATA_PATH);
  if (!Array.isArray(rows)) {
    throw new Error("scripts/player_metadata.json must be an array");
  }

  return rows
    .map((row) => ({
      wr_id: Number(row && row.wr_id),
      name: trim(row && row.name),
      gender: trim(row && row.gender).toLowerCase(),
      soop_id: trim(row && row.soop_user_id),
    }))
    .filter((row) => Number.isFinite(row.wr_id) && row.name && row.gender && row.soop_id)
    .sort((a, b) => a.wr_id - b.wr_id);
}

async function main() {
  if (!SOOP_CLIENT_ID) {
    throw new Error("Missing SOOP_CLIENT_ID in .env.local or environment. Hardcoded fallback is intentionally disabled.");
  }

  const metadataTargets = loadMetadataTargets();
  const pageLimit = toNumber(argValue("--page-limit"), DEFAULT_PAGE_LIMIT);
  const targetIds = metadataTargets.map((player) => player.soop_id);
  const liveById = await fetchLiveRowsByIds({
    clientId: SOOP_CLIENT_ID,
    targetIds,
    pageLimit,
  });

  const channels = {};
  let liveCount = 0;

  for (const player of metadataTargets) {
    const live = liveById.get(player.soop_id.toLowerCase());
    const isLive = Boolean(live);
    if (isLive) liveCount += 1;

    channels[player.soop_id] = {
      isLive,
      thumbnail: isLive ? live.thumbnail || "" : "",
      title: isLive ? live.title || "" : "",
      viewers: isLive ? live.viewers || "" : "",
      nickname: isLive ? live.nickname || player.name : player.name,
      broad_start: isLive ? live.broadStart || "" : "",
      player_name: player.name,
      wr_id: player.wr_id,
      gender: player.gender,
    };
  }

  const snapshot = {
    schema_version: "1.0.0",
    generated_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
    source: SOOP_BROAD_LIST_URL,
    totals: {
      metadata_players_with_soop_id: metadataTargets.length,
      live_rows_fetched: liveById.size,
      matched_live_players: liveCount,
      offline_players: metadataTargets.length - liveCount,
    },
    channels,
  };

  writeJson(OUTPUT_PATH, snapshot);

  console.log("Generated SOOP live snapshot.");
  console.log(`- source: ${SOOP_BROAD_LIST_URL}`);
  console.log(`- metadata_players_with_soop_id: ${metadataTargets.length}`);
  console.log(`- live_rows_fetched: ${liveById.size}`);
  console.log(`- matched_live_players: ${liveCount}`);
  console.log(`- offline_players: ${metadataTargets.length - liveCount}`);
  console.log(`- output: ${OUTPUT_PATH}`);
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
});
