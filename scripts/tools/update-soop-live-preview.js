const fs = require("fs");
const path = require("path");

const ROOT = path.resolve(__dirname, "..", "..");
const PREVIEW_PATH = path.join(ROOT, "data", "metadata", "soop_live_preview.v1.json");

function hasFlag(flag) {
  return process.argv.includes(flag);
}

function argValue(flag, fallback = "") {
  const index = process.argv.indexOf(flag);
  if (index >= 0 && process.argv[index + 1]) return process.argv[index + 1];
  return fallback;
}

function readJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, "utf8").replace(/^\uFEFF/, ""));
}

function writeJson(filePath, value) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, JSON.stringify(value, null, 2), "utf8");
}

function trim(value) {
  return String(value || "").trim();
}

function seoulBroadcastStartNow() {
  const formatter = new Intl.DateTimeFormat("sv-SE", {
    timeZone: "Asia/Seoul",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
  });
  return formatter.format(new Date()).replace(" ", " ");
}

function printUsage() {
  console.log("Usage:");
  console.log("  node scripts/tools/update-soop-live-preview.js --list");
  console.log("  node scripts/tools/update-soop-live-preview.js --soop-id <id> --live [--title <text>] [--viewers <count>] [--nickname <text>] [--thumbnail <url>] [--broad-start \"YYYY-MM-DD HH:mm:ss\"]");
  console.log("  node scripts/tools/update-soop-live-preview.js --soop-id <id> --offline");
  console.log("");
  console.log("Examples:");
  console.log("  node scripts/tools/update-soop-live-preview.js --soop-id dmk1212 --live --title \"sample title\" --viewers 9 --nickname \"sample name\"");
  console.log("  node scripts/tools/update-soop-live-preview.js --soop-id dmk1212 --offline");
}

function printChannels(doc) {
  const channels = doc && typeof doc.channels === "object" ? doc.channels : {};
  const entries = Object.entries(channels).sort((a, b) => String(a[0]).localeCompare(String(b[0])));
  if (!entries.length) {
    console.log("No preview channels found.");
    return;
  }

  console.log(`Preview file: ${PREVIEW_PATH}`);
  console.log(`Updated at: ${doc.updated_at || "-"}`);
  for (const [soopId, row] of entries) {
    const isLive = row && row.isLive === true ? "LIVE" : "OFF";
    const title = trim(row && row.title) || "-";
    const viewers = trim(row && row.viewers) || "-";
    const broadStart = trim(row && row.broad_start) || "-";
    const nickname = trim(row && row.nickname) || "-";
    console.log(`${soopId} | ${isLive} | ${nickname} | viewers=${viewers} | start=${broadStart} | title=${title}`);
  }
}

function main() {
  if (!fs.existsSync(PREVIEW_PATH)) {
    throw new Error(`Missing file: ${PREVIEW_PATH}`);
  }

  const doc = readJson(PREVIEW_PATH);
  if (!doc || typeof doc !== "object") {
    throw new Error("Invalid preview file.");
  }
  if (!doc.channels || typeof doc.channels !== "object") {
    doc.channels = {};
  }

  if (hasFlag("--list")) {
    printChannels(doc);
    return;
  }

  const soopId = trim(argValue("--soop-id"));
  if (!soopId) {
    printUsage();
    throw new Error("--soop-id is required unless --list is used.");
  }

  const setLive = hasFlag("--live");
  const setOffline = hasFlag("--offline");
  if (setLive === setOffline) {
    printUsage();
    throw new Error("Choose exactly one of --live or --offline.");
  }

  const existing = doc.channels[soopId] && typeof doc.channels[soopId] === "object" ? doc.channels[soopId] : {};
  const next = {
    ...existing,
  };

  const title = trim(argValue("--title"));
  const viewers = trim(argValue("--viewers"));
  const nickname = trim(argValue("--nickname"));
  const thumbnail = trim(argValue("--thumbnail"));
  const broadStart = trim(argValue("--broad-start"));

  if (setOffline) {
    next.isLive = false;
    next.thumbnail = "";
    next.title = "";
    next.viewers = "";
    next.broad_start = "";
    if (nickname) next.nickname = nickname;
  } else {
    next.isLive = true;
    next.title = title || trim(existing.title);
    next.viewers = viewers || trim(existing.viewers);
    next.nickname = nickname || trim(existing.nickname);
    next.thumbnail = thumbnail || trim(existing.thumbnail);
    next.broad_start = broadStart || trim(existing.broad_start) || seoulBroadcastStartNow();
  }

  doc.channels[soopId] = next;
  doc.updated_at = new Date().toISOString();
  writeJson(PREVIEW_PATH, doc);

  console.log(`Updated SOOP preview channel: ${soopId}`);
  console.log(`- isLive: ${next.isLive === true ? "true" : "false"}`);
  console.log(`- nickname: ${trim(next.nickname) || "-"}`);
  console.log(`- viewers: ${trim(next.viewers) || "-"}`);
  console.log(`- broad_start: ${trim(next.broad_start) || "-"}`);
  console.log(`- title: ${trim(next.title) || "-"}`);
  console.log(`- thumbnail: ${trim(next.thumbnail) || "-"}`);
}

main();
