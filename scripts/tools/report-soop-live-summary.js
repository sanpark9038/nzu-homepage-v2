const fs = require("fs");
const path = require("path");

const ROOT = path.resolve(__dirname, "..", "..");
const SNAPSHOT_PATH = path.join(ROOT, "data", "metadata", "soop_live_snapshot.generated.v1.json");
const PREVIEW_PATH = path.join(ROOT, "data", "metadata", "soop_live_preview.v1.json");
const VERIFICATION_TARGETS_PATH = path.join(ROOT, "data", "metadata", "soop_live_verification_targets.v1.json");
const SNAPSHOT_FRESH_WINDOW_MS = 15 * 60 * 1000;

function readJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, "utf8").replace(/^\uFEFF/, ""));
}

function trim(value) {
  return String(value || "").trim();
}

function loadChannels(filePath) {
  if (!fs.existsSync(filePath)) return {};
  const json = readJson(filePath);
  return json && typeof json.channels === "object" ? json.channels : {};
}

function loadVerificationTargets() {
  if (!fs.existsSync(VERIFICATION_TARGETS_PATH)) return [];
  const json = readJson(VERIFICATION_TARGETS_PATH);
  const targets = Array.isArray(json && json.targets) ? json.targets : [];
  return targets
    .map((row) => ({
      soop_id: trim(row && row.soop_id),
      player_name: trim(row && row.player_name),
      search_name: trim(row && row.search_name),
      reason: trim(row && row.reason),
    }))
    .filter((row) => row.soop_id);
}

function snapshotFreshness(updatedAt) {
  const raw = trim(updatedAt);
  if (!raw) {
    return { status: "missing", ageMinutes: null };
  }
  const updated = new Date(raw);
  if (Number.isNaN(updated.getTime())) {
    return { status: "invalid", ageMinutes: null };
  }
  const ageMs = Date.now() - updated.getTime();
  const ageMinutes = Math.floor(ageMs / (60 * 1000));
  if (ageMs < 0) {
    return { status: "future", ageMinutes };
  }
  if (ageMs <= SNAPSHOT_FRESH_WINDOW_MS) {
    return { status: "fresh", ageMinutes };
  }
  return { status: "stale", ageMinutes };
}

function printRow(id, row, label) {
  const status = row && row.isLive === true ? "LIVE" : "OFF";
  const nickname = trim(row && row.nickname) || "-";
  const viewers = trim(row && row.viewers) || "-";
  const broadStart = trim(row && row.broad_start) || "-";
  const title = trim(row && row.title) || "-";
  console.log(`${label} ${id} | ${status} | ${nickname} | viewers=${viewers} | start=${broadStart} | title=${title}`);
}

function main() {
  if (!fs.existsSync(SNAPSHOT_PATH)) {
    throw new Error(`Missing snapshot file: ${SNAPSHOT_PATH}`);
  }

  const snapshot = readJson(SNAPSHOT_PATH);
  const snapshotChannels = snapshot && typeof snapshot.channels === "object" ? snapshot.channels : {};
  const previewChannels = loadChannels(PREVIEW_PATH);
  const sampleIds = Object.keys(previewChannels).map(trim).filter(Boolean);
  const verificationTargets = loadVerificationTargets();
  const freshness = snapshotFreshness(snapshot.updated_at);

  console.log(`Snapshot: ${SNAPSHOT_PATH}`);
  console.log(`Updated: ${trim(snapshot.updated_at) || "-"}`);
  console.log(`Freshness: ${freshness.status}${freshness.ageMinutes === null ? "" : ` (${freshness.ageMinutes}m old)`}`);
  console.log(`Total SOOP players: ${snapshot.totals?.metadata_players_with_soop_id ?? 0}`);
  console.log(`Current live players: ${snapshot.totals?.matched_live_players ?? 0}`);
  if (freshness.status !== "fresh") {
    console.log("Warning: snapshot is not fresh, so site live state may already be outdated.");
  }
  console.log("");

  console.log("[Current Live]");
  const liveEntries = Object.entries(snapshotChannels)
    .filter(([, row]) => row && row.isLive === true)
    .sort((a, b) => Number(trim(b[1]?.viewers) || 0) - Number(trim(a[1]?.viewers) || 0));

  if (!liveEntries.length) {
    console.log("- none");
  } else {
    for (const [id, row] of liveEntries) {
      printRow(id, row, "-");
    }
  }

  console.log("");
  console.log("[Sample Check]");
  if (!sampleIds.length) {
    console.log("- no sample ids configured in soop_live_preview.v1.json");
    return;
  }

  for (const id of sampleIds) {
    const row = snapshotChannels[id] || previewChannels[id] || null;
    printRow(id, row, "-");
  }

  if (verificationTargets.length) {
    console.log("");
    console.log("[Verification Check]");
    for (const target of verificationTargets) {
      const row = snapshotChannels[target.soop_id] || null;
      const label = target.player_name ? `- ${target.player_name}` : "-";
      printRow(target.soop_id, row, label);
    }
  }
}

main();
