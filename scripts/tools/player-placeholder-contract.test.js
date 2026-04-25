const fs = require("fs");
const path = require("path");
const assert = require("node:assert/strict");

const ROOT = path.join(__dirname, "..", "..");
const placeholderPath = path.join(ROOT, "public", "placeholder-player.svg");
const tierCardPath = path.join(ROOT, "components", "players", "PlayerCard.tsx");
const playerSearchPath = path.join(ROOT, "app", "player", "PlayerSearchResult.tsx");

function runTest(name, fn) {
  try {
    fn();
    console.log(`PASS ${name}`);
  } catch (error) {
    console.error(`FAIL ${name}`);
    throw error;
  }
}

runTest("player placeholder is a real svg asset", () => {
  const source = fs.readFileSync(placeholderPath, "utf8").trimStart();

  assert.ok(source.startsWith("<svg"), "placeholder-player.svg must contain SVG markup");
});

runTest("player-facing components use the svg placeholder asset", () => {
  for (const filePath of [tierCardPath, playerSearchPath]) {
    const source = fs.readFileSync(filePath, "utf8");

    assert.ok(source.includes("/placeholder-player.svg"), `${filePath} should use the svg placeholder`);
    assert.equal(source.includes("/placeholder-player.png"), false, `${filePath} should not use the mislabeled png placeholder`);
  }
});
