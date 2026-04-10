const fs = require("fs");
const path = require("path");

const ROOT = path.resolve(__dirname, "..", "..");
const SNAPSHOT_PATH = path.join(ROOT, "data", "metadata", "soop_live_snapshot.generated.v1.json");
const PREVIEW_PATH = path.join(ROOT, "data", "metadata", "soop_live_preview.v1.json");
const VERIFICATION_TARGETS_PATH = path.join(ROOT, "data", "metadata", "soop_live_verification_targets.v1.json");

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

function findCurrentLive(snapshotChannels) {
  return Object.entries(snapshotChannels)
    .filter(([, row]) => row && row.isLive === true)
    .sort((a, b) => Number(trim(b[1]?.viewers) || 0) - Number(trim(a[1]?.viewers) || 0))
    .map(([soopId, row]) => ({
      soop_id: soopId,
      player_name: trim(row && row.player_name) || trim(row && row.nickname) || soopId,
      nickname: trim(row && row.nickname),
      title: trim(row && row.title),
      viewers: trim(row && row.viewers),
      expected: "LIVE",
    }));
}

function printChecklistItem(label, playerName, soopId, expected, extra) {
  const searchName = trim(arguments[5]) || playerName || soopId;
  const parts = [
    `${label}. ${playerName || soopId}`,
    `expected=${expected}`,
    `search=${searchName}`,
    `soop_id=${soopId}`,
  ];
  if (extra) parts.push(extra);
  console.log(parts.join(" | "));
}

function pushUniqueItem(items, nextItem) {
  const key = trim(nextItem.soop_id).toLowerCase();
  const existing = items.find((item) => trim(item.soop_id).toLowerCase() === key);
  if (!existing) {
    items.push(nextItem);
    return;
  }

  const mergedExpected = existing.expected === "LIVE" || nextItem.expected === "LIVE" ? "LIVE" : "OFF";
  const existingNotes = [trim(existing.note)].filter(Boolean);
  const nextNotes = [trim(nextItem.note)].filter(Boolean);
  const mergedNotes = Array.from(new Set([...existingNotes, ...nextNotes]));

  existing.expected = mergedExpected;
  existing.player_name = existing.player_name || nextItem.player_name;
  existing.note = mergedNotes.join(", ");
  if (!existing.viewers && nextItem.viewers) {
    existing.viewers = nextItem.viewers;
  }
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
  const currentLive = findCurrentLive(snapshotChannels);

  console.log("[UI Checklist]");
  console.log("Search each player on the site and verify the expected state.");
  console.log("");

  const checklist = [];

  for (const row of currentLive.slice(0, 2)) {
    pushUniqueItem(checklist, {
      player_name: row.player_name,
      search_name: row.player_name,
      soop_id: row.soop_id,
      expected: row.expected,
      note: "current live",
      viewers: row.viewers,
    });
  }

  for (const soopId of sampleIds) {
    const row = snapshotChannels[soopId] || previewChannels[soopId] || null;
    pushUniqueItem(checklist, {
      player_name: trim(row && row.player_name) || trim(row && row.nickname) || soopId,
      search_name: trim(row && row.player_name) || trim(row && row.nickname) || soopId,
      soop_id: soopId,
      expected: row && row.isLive === true ? "LIVE" : "OFF",
      note: "sample",
      viewers: trim(row && row.viewers),
    });
  }

  for (const target of verificationTargets) {
    const row = snapshotChannels[target.soop_id] || null;
    pushUniqueItem(checklist, {
      player_name: target.player_name || trim(row && row.player_name) || trim(row && row.nickname) || target.soop_id,
      search_name: target.search_name || target.player_name || trim(row && row.player_name) || trim(row && row.nickname) || target.soop_id,
      soop_id: target.soop_id,
      expected: row && row.isLive === true ? "LIVE" : "OFF",
      note: target.reason || "verification",
      viewers: trim(row && row.viewers),
    });
  }

  let index = 1;
  for (const item of checklist) {
    const extraParts = [];
    if (item.viewers) extraParts.push(`viewers=${item.viewers}`);
    if (item.note) extraParts.push(item.note);
    printChecklistItem(
      String(index++),
      item.player_name,
      item.soop_id,
      item.expected,
      extraParts.join(" | "),
      item.search_name
    );
  }
}

main();
