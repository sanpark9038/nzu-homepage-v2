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

runTest("live-player service results are filtered after live overlay", () => {
  const source = readProjectFile(PLAYER_SERVICE_PATH);

  assert.match(source, /const\s+players\s*=\s*applyPlayerServiceView/);
  assert.match(source, /return\s+players\.filter\(\(player\)\s*=>\s*player\.is_live\s*===\s*true\)/);
});

