const fs = require("fs");
const path = require("path");
require("dotenv").config({ path: path.join(__dirname, "..", "..", ".env.local"), quiet: true });
const { SOOP_BROAD_LIST_URL, trim, fetchAllLiveRows } = require("./lib/soop-open-api");

const ROOT = path.resolve(__dirname, "..", "..");
const PLAYER_METADATA_PATH = path.join(ROOT, "scripts", "player_metadata.json");
const REPORTS_DIR = path.join(ROOT, "tmp", "reports");
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
    .filter((row) => Number.isFinite(row.wr_id) && row.name && row.gender && row.soop_id);
}

async function main() {
  if (!SOOP_CLIENT_ID) {
    throw new Error("Missing SOOP_CLIENT_ID in .env.local or environment. Hardcoded fallback is intentionally disabled.");
  }

  const metadataTargets = loadMetadataTargets();
  const pageLimit = toNumber(argValue("--page-limit"), DEFAULT_PAGE_LIMIT);
  const liveRows = await fetchAllLiveRows({
    clientId: SOOP_CLIENT_ID,
    pageLimit,
  });

  const liveById = new Map(liveRows.map((row) => [trim(row.soopId).toLowerCase(), row]));
  const matchedLive = [];
  const offline = [];

  for (const player of metadataTargets) {
    const live = liveById.get(player.soop_id.toLowerCase());
    if (!live) {
      offline.push(player);
      continue;
    }
    matchedLive.push({
      ...player,
      nickname: live.nickname || "",
      title: live.title || "",
      viewers: live.viewers || "",
      broad_start: live.broadStart || "",
      thumbnail: live.thumbnail || "",
    });
  }

  const report = {
    generated_at: new Date().toISOString(),
    source: SOOP_BROAD_LIST_URL,
    player_metadata_path: PLAYER_METADATA_PATH,
    totals: {
      metadata_players_with_soop_id: metadataTargets.length,
      live_rows_fetched: liveRows.length,
      matched_live_players: matchedLive.length,
      offline_players: offline.length,
    },
    matched_live: matchedLive.sort((a, b) => String(b.viewers || "").localeCompare(String(a.viewers || ""), "ko")),
    offline: offline,
  };

  const reportPath = path.join(REPORTS_DIR, "soop_live_coverage_report.json");
  writeJson(reportPath, report);

  console.log("Generated SOOP live coverage report.");
  console.log(`- source: ${SOOP_BROAD_LIST_URL}`);
  console.log(`- metadata_players_with_soop_id: ${metadataTargets.length}`);
  console.log(`- live_rows_fetched: ${liveRows.length}`);
  console.log(`- matched_live_players: ${matchedLive.length}`);
  console.log(`- offline_players: ${offline.length}`);
  console.log(`- report: ${reportPath}`);
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
});
