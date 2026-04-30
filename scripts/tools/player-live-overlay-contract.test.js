const fs = require("fs");
const path = require("path");
const assert = require("node:assert/strict");

const ROOT = path.resolve(__dirname, "..", "..");
const OVERLAY_PATH = path.join(ROOT, "lib", "player-live-overlay.ts");
const PLAYER_SERVICE_PATH = path.join(ROOT, "lib", "player-service.ts");

function readProjectFile(filePath) {
  return fs.readFileSync(filePath, "utf8");
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

runTest("player live overlay refuses stale database live state", () => {
  const source = readProjectFile(OVERLAY_PATH);

  assert.match(source, /SOOP_DB_LIVE_MAX_AGE_MS\s*=\s*15\s*\*\s*60\s*\*\s*1000/);
  assert.match(source, /function\s+isFreshDbLiveState/);
  assert.match(source, /function\s+clearStaleLiveState/);
  assert.match(source, /return\s+clearStaleLiveState\(player\)/);
});

runTest("player live overlay no longer reads local SOOP JSON snapshots", () => {
  const source = readProjectFile(OVERLAY_PATH);

  assert.doesNotMatch(source, /soop_live_preview\.v1\.json/);
  assert.doesNotMatch(source, /soop_live_snapshot\.generated\.v1\.json/);
  assert.doesNotMatch(source, /eval\(["']require["']\)/);
  assert.doesNotMatch(source, /loadSoopLiveSnapshotFile|loadSoopLivePreview|loadSoopGeneratedLiveSnapshot/);
  assert.doesNotMatch(source, /SOOP_GENERATED_SNAPSHOT_MAX_AGE_MS|SOOP_PREVIEW_LIVE_WINDOW_MS/);
});

runTest("live-player service results are filtered after live overlay", () => {
  const source = readProjectFile(PLAYER_SERVICE_PATH);

  assert.match(source, /const\s+players\s*=\s*applyPlayerServiceView/);
  assert.match(source, /return\s+players\.filter\(\(player\)\s*=>\s*player\.is_live\s*===\s*true\)/);
});

runTest("cached player lists apply live freshness after cache read", () => {
  const source = readProjectFile(PLAYER_SERVICE_PATH);

  assert.match(source, /return\s+applyServingMetadataLayer\(\(data\s*\|\|\s*\[\]\)\s+as\s+Player\[\]\)/);
  assert.match(
    source,
    /async\s+getCachedPlayersList\(\)\s*{\s*return\s+applyLiveOverlayLayer\(await\s+fetchCachedPlayersForList\(\)\);/s
  );
});
