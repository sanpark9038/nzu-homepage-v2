const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");

const repoRoot = path.resolve(__dirname, "..", "..");

function readProjectFile(filePath) {
  return fs.readFileSync(path.join(repoRoot, filePath), "utf8");
}

test("tier page uses cached full-list reads and a filtered live-only query", () => {
  const source = readProjectFile("app/tier/page.tsx");

  assert.match(source, /export\s+const\s+dynamic\s*=\s*"force-dynamic"/);
  assert.match(source, /export\s+const\s+revalidate\s*=\s*0/);
  assert.match(source, /playerService\.getCachedPlayersList\(\)/);
  assert.match(source, /playerService\.getLivePlayers\(\)/);
  assert.doesNotMatch(source, /playerService\.getAllPlayers\(\)/);
  assert.match(
    source,
    /liveOnly\s*\?\s*playerService\.getLivePlayers\(\)\s*:\s*playerService\.getCachedPlayersList\(\)/s
  );
});

test("tier grids use a lightweight tier card instead of hydrating the shared player card", () => {
  const tierGroupSource = readProjectFile("components/players/TierGroup.tsx");
  const compactGridSource = readProjectFile("components/players/TeamTierCompactGrid.tsx");

  assert.match(tierGroupSource, /TierPlayerCard/);
  assert.match(compactGridSource, /TierPlayerCard/);
  assert.doesNotMatch(tierGroupSource, /<PlayerCard\b/);
  assert.doesNotMatch(compactGridSource, /<PlayerCard\b/);
});

test("tier h2h selector accepts lightweight matchup summaries", () => {
  const source = readProjectFile("components/players/H2HSelectorBar.tsx");

  assert.match(source, /MatchupPlayerSummary/);
  assert.doesNotMatch(source, /from ['"]\.\/PlayerCard['"]/);
  assert.doesNotMatch(source, /CustomEvent<Player>/);
});

test("tier lightweight card keeps the initial route payload text-first", () => {
  const source = readProjectFile("components/players/TierPlayerCard.tsx");

  assert.doesNotMatch(source, /from ["']next\/image["']/);
  assert.doesNotMatch(source, /resolveSoopChannelImageUrl/);
  assert.doesNotMatch(source, /<Image\b/);
});
