const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");

const repoRoot = path.resolve(__dirname, "..", "..");

function readProjectFile(filePath) {
  return fs.readFileSync(path.join(repoRoot, filePath), "utf8");
}

test("SOOP thumbnail proxy streams upstream images instead of buffering the whole file", () => {
  const route = readProjectFile("app/api/soop/thumbnail/route.ts");

  assert.match(route, /upstream\.body/);
  assert.equal(route.includes("arrayBuffer()"), false);
});

test("tier player cards let Next optimize profile images but keep live thumbnail preload explicit", () => {
  const playerCard = readProjectFile("components/players/PlayerCard.tsx");
  const tierProfileImageBlock = playerCard.match(/isTierVariant \? \([\s\S]*?\) : \(/)?.[0] || "";

  assert.equal(tierProfileImageBlock.includes("unoptimized"), false);
  assert.match(playerCard, /preloadLiveThumbnail/);
});
