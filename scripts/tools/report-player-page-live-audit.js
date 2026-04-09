const fs = require("fs");
const path = require("path");

const ROOT = path.resolve(__dirname, "..", "..");
const PLAYER_METADATA_PATH = path.join(ROOT, "scripts", "player_metadata.json");
const SNAPSHOT_PATH = path.join(ROOT, "data", "metadata", "soop_live_snapshot.generated.v1.json");
const PREVIEW_PATH = path.join(ROOT, "data", "metadata", "soop_live_preview.v1.json");
const VERIFICATION_TARGETS_PATH = path.join(ROOT, "data", "metadata", "soop_live_verification_targets.v1.json");
const OUTPUT_PATH = path.join(ROOT, "tmp", "reports", "player_page_live_audit.json");
const SNAPSHOT_FRESH_WINDOW_MS = 15 * 60 * 1000;

function trim(value) {
  return String(value || "").trim();
}

function readJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, "utf8").replace(/^\uFEFF/, ""));
}

function writeJson(filePath, value) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, JSON.stringify(value, null, 2), "utf8");
}

function loadChannels(filePath) {
  if (!fs.existsSync(filePath)) return {};
  const json = readJson(filePath);
  return json && typeof json.channels === "object" ? json.channels : {};
}

function loadVerificationTargets() {
  if (!fs.existsSync(VERIFICATION_TARGETS_PATH)) return [];
  const json = readJson(VERIFICATION_TARGETS_PATH);
  const rows = Array.isArray(json && json.targets) ? json.targets : [];
  return rows
    .map((row) => ({
      soop_id: trim(row && row.soop_id),
      player_name: trim(row && row.player_name),
      search_name: trim(row && row.search_name),
      reason: trim(row && row.reason),
    }))
    .filter((row) => row.soop_id);
}

function loadPlayerMetadata() {
  if (!fs.existsSync(PLAYER_METADATA_PATH)) {
    throw new Error(`Missing file: ${PLAYER_METADATA_PATH}`);
  }
  const rows = readJson(PLAYER_METADATA_PATH);
  if (!Array.isArray(rows)) {
    throw new Error("scripts/player_metadata.json must be an array");
  }

  const bySoopId = new Map();
  for (const row of rows) {
    const soopId = trim(row && row.soop_user_id);
    if (!soopId) continue;
    bySoopId.set(soopId, {
      wr_id: Number(row && row.wr_id),
      name: trim(row && row.name),
      gender: trim(row && row.gender).toLowerCase(),
    });
  }

  return {
    rows,
    bySoopId,
    totals: {
      total_rows: rows.length,
      with_soop_user_id: rows.filter((row) => trim(row && row.soop_user_id)).length,
      without_soop_user_id: rows.filter((row) => !trim(row && row.soop_user_id)).length,
    },
  };
}

function snapshotFreshness(updatedAt) {
  const raw = trim(updatedAt);
  if (!raw) return { status: "missing", age_minutes: null };
  const parsed = new Date(raw);
  if (Number.isNaN(parsed.getTime())) return { status: "invalid", age_minutes: null };
  const ageMs = Date.now() - parsed.getTime();
  const ageMinutes = Math.floor(ageMs / (60 * 1000));
  if (ageMs < 0) return { status: "future", age_minutes: ageMinutes };
  if (ageMs <= SNAPSHOT_FRESH_WINDOW_MS) return { status: "fresh", age_minutes: ageMinutes };
  return { status: "stale", age_minutes: ageMinutes };
}

function buildTargetRow(target, metadataBySoopId, snapshotChannels) {
  const metadata = metadataBySoopId.get(target.soop_id) || null;
  const live = snapshotChannels[target.soop_id] || null;
  return {
    player_name: target.player_name || trim(live && live.player_name) || trim(live && live.nickname) || null,
    search_name: target.search_name || target.player_name || null,
    soop_id: target.soop_id,
    reason: target.reason || null,
    metadata_match: metadata
      ? {
          wr_id: metadata.wr_id,
          name: metadata.name || null,
          gender: metadata.gender || null,
        }
      : null,
    live_state: {
      is_live: live ? live.isLive === true : false,
      title: trim(live && live.title) || null,
      viewers: trim(live && live.viewers) || null,
      broad_start: trim(live && live.broad_start) || null,
      nickname: trim(live && live.nickname) || null,
    },
  };
}

function main() {
  if (!fs.existsSync(SNAPSHOT_PATH)) {
    throw new Error(`Missing snapshot file: ${SNAPSHOT_PATH}`);
  }

  const snapshot = readJson(SNAPSHOT_PATH);
  const snapshotChannels = snapshot && typeof snapshot.channels === "object" ? snapshot.channels : {};
  const previewChannels = loadChannels(PREVIEW_PATH);
  const verificationTargets = loadVerificationTargets();
  const metadata = loadPlayerMetadata();
  const freshness = snapshotFreshness(snapshot.updated_at);

  const previewIds = Object.keys(previewChannels).map(trim).filter(Boolean);
  const previewRows = previewIds.map((soopId) => {
    const row = snapshotChannels[soopId] || previewChannels[soopId] || null;
    const metadataRow = metadata.bySoopId.get(soopId) || null;
    return {
      soop_id: soopId,
      player_name: trim(row && row.player_name) || trim(row && row.nickname) || soopId,
      metadata_name: metadataRow ? metadataRow.name || null : null,
      expected_state: row && row.isLive === true ? "LIVE" : "OFF",
      viewers: trim(row && row.viewers) || null,
      title: trim(row && row.title) || null,
    };
  });

  const liveRows = Object.entries(snapshotChannels)
    .filter(([, row]) => row && row.isLive === true)
    .map(([soopId, row]) => ({
      soop_id: soopId,
      player_name: trim(row && row.player_name) || trim(row && row.nickname) || soopId,
      nickname: trim(row && row.nickname) || null,
      viewers: trim(row && row.viewers) || null,
      title: trim(row && row.title) || null,
      metadata_name: (metadata.bySoopId.get(soopId) || {}).name || null,
    }))
    .sort((a, b) => Number(b.viewers || 0) - Number(a.viewers || 0));

  const report = {
    schema_version: "1.0.0",
    generated_at: new Date().toISOString(),
    snapshot: {
      path: SNAPSHOT_PATH,
      updated_at: trim(snapshot.updated_at) || null,
      freshness,
      totals: snapshot.totals || null,
    },
    metadata: metadata.totals,
    verification_targets: verificationTargets.map((target) =>
      buildTargetRow(target, metadata.bySoopId, snapshotChannels)
    ),
    preview_sample: previewRows,
    current_live: liveRows,
  };

  writeJson(OUTPUT_PATH, report);
  console.log("Generated player page live audit report.");
  console.log(`- snapshot_freshness: ${freshness.status}`);
  console.log(`- metadata_with_soop_user_id: ${metadata.totals.with_soop_user_id}`);
  console.log(`- verification_targets: ${report.verification_targets.length}`);
  console.log(`- current_live: ${report.current_live.length}`);
  console.log(`- report: ${OUTPUT_PATH}`);
}

main();
