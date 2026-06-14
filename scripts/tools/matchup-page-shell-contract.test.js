const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");

const repoRoot = path.resolve(__dirname, "..", "..");

function readProjectFile(relativePath) {
  return fs.readFileSync(path.join(repoRoot, relativePath), "utf8");
}

function existsProjectFile(relativePath) {
  return fs.existsSync(path.join(repoRoot, relativePath));
}

test("match route uses a server page to hydrate the client with initial players", () => {
  const pageSource = readProjectFile("app/match/page.tsx");

  assert.doesNotMatch(pageSource, /^['"]use client['"]/m);
  assert.match(pageSource, /playerService\.getCachedPlayersList\(\)/);
  assert.match(pageSource, /mapPlayersToMatchupSummaries\(players\)/);
  assert.match(pageSource, /initialPlayersLoadFailed = true/);
  assert.match(pageSource, /<MatchPageClient initialPlayers=\{initialPlayers\} initialPlayersLoadFailed=\{initialPlayersLoadFailed\} \/>/);
});

test("match client keeps a no-store API fallback only when server hydration failed", () => {
  assert.ok(existsProjectFile("app/match/MatchPageClient.tsx"));
  const clientSource = readProjectFile("app/match/MatchPageClient.tsx");

  assert.match(clientSource, /^\uFEFF?['"]use client['"]/m);
  assert.match(clientSource, /initialPlayers:\s*MatchupPlayerSummary\[\]/);
  assert.match(clientSource, /initialPlayersLoadFailed:\s*boolean/);
  assert.match(clientSource, /useState<Player\[\]>\(initialPlayers\)/);
  assert.match(clientSource, /if \(!initialPlayersLoadFailed\)/);
  assert.match(clientSource, /fetchMatchupPlayers\(\)/);
});

test("public matchup players API exposes CDN cache headers for fallback loads", () => {
  const routeSource = readProjectFile("app/api/players/route.ts");

  assert.match(routeSource, /export\s+const\s+revalidate\s*=\s*300/);
  assert.match(routeSource, /Cache-Control/);
  assert.match(routeSource, /s-maxage=300,\s*stale-while-revalidate=31536000/);
});
