const fs = require("fs");
const path = require("path");
require("dotenv").config({ path: path.join(__dirname, "..", "..", ".env.local"), quiet: true });
const { SOOP_BROAD_LIST_URL, trim, fetchLiveRowsByIds } = require("./lib/soop-open-api");

const ROOT = path.resolve(__dirname, "..", "..");
const PREVIEW_PATH = path.join(ROOT, "data", "metadata", "soop_live_preview.v1.json");
const SOOP_CLIENT_ID = String(process.env.SOOP_CLIENT_ID || "").trim();
const DEFAULT_PAGE_LIMIT = 5;

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

function getTargetSoopIds(doc) {
  const channels = doc && typeof doc.channels === "object" ? doc.channels : {};
  return Object.keys(channels).map(trim).filter(Boolean);
}

function toNumber(value, fallback) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function mainSync(doc, foundRowsById) {
  const channels = doc && typeof doc.channels === "object" ? doc.channels : {};
  const nextChannels = {};

  for (const [soopId, existing] of Object.entries(channels)) {
    const key = trim(soopId).toLowerCase();
    const row = foundRowsById.get(key);
    const prev = existing && typeof existing === "object" ? existing : {};

    if (!row) {
      nextChannels[soopId] = {
        ...prev,
        isLive: false,
        thumbnail: "",
        title: "",
        viewers: "",
        broad_start: "",
      };
      continue;
    }

    nextChannels[soopId] = {
      ...prev,
      isLive: true,
      thumbnail: row.thumbnail || trim(prev.thumbnail),
      title: row.title || trim(prev.title),
      viewers: row.viewers || "",
      nickname: row.nickname || trim(prev.nickname),
      broad_start: row.broadStart || "",
    };
  }

  return {
    ...doc,
    updated_at: new Date().toISOString(),
    channels: nextChannels,
  };
}

async function main() {
  if (!SOOP_CLIENT_ID) {
    throw new Error("Missing SOOP_CLIENT_ID in .env.local or environment. Hardcoded fallback is intentionally disabled.");
  }
  if (!fs.existsSync(PREVIEW_PATH)) {
    throw new Error(`Missing file: ${PREVIEW_PATH}`);
  }

  const doc = readJson(PREVIEW_PATH);
  const targetIds = getTargetSoopIds(doc);
  if (!targetIds.length) {
    throw new Error("No sample SOOP ids found in soop_live_preview.v1.json.");
  }

  const pageLimit = toNumber(argValue("--page-limit"), DEFAULT_PAGE_LIMIT);
  const foundRowsById = await fetchLiveRowsByIds({
    clientId: SOOP_CLIENT_ID,
    targetIds,
    pageLimit,
  });
  const nextDoc = mainSync(doc, foundRowsById);
  writeJson(PREVIEW_PATH, nextDoc);

  console.log(`Refreshed SOOP live preview.`);
  console.log(`- source: ${SOOP_BROAD_LIST_URL}`);
  console.log(`- targets: ${targetIds.length}`);
  console.log(`- live_found: ${foundRowsById.size}`);
  console.log(`- updated: ${PREVIEW_PATH}`);
  for (const targetId of targetIds) {
    const key = trim(targetId).toLowerCase();
    const row = nextDoc.channels[targetId];
    console.log(
      `  - ${targetId}: ${row && row.isLive === true ? "LIVE" : "OFF"} | ${trim(row && row.nickname) || "-"} | ${trim(row && row.title) || "-"}`
    );
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
});
