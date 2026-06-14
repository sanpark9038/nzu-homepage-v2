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

test("match client keeps an API fallback only when server hydration failed", () => {
  assert.ok(existsProjectFile("app/match/MatchPageClient.tsx"));
  const clientSource = readProjectFile("app/match/MatchPageClient.tsx");
  const helperSource = readProjectFile("lib/matchup-helpers.ts");

  assert.match(clientSource, /^\uFEFF?['"]use client['"]/m);
  assert.match(clientSource, /initialPlayers:\s*MatchupPlayerSummary\[\]/);
  assert.match(clientSource, /initialPlayersLoadFailed:\s*boolean/);
  assert.match(clientSource, /useState<Player\[\]>\(initialPlayers\)/);
  assert.match(clientSource, /if \(!initialPlayersLoadFailed\)/);
  assert.match(clientSource, /fetchMatchupPlayers\(\)/);
  assert.doesNotMatch(
    helperSource,
    /fetch\("\/api\/players",\s*\{\s*cache:\s*["']no-store["']\s*\}\)/,
    "Public matchup player fallback should allow the API route shared cache policy to work"
  );
});

test("match client does not ship disabled entry-board panel code", () => {
  const clientSource = readProjectFile("app/match/MatchPageClient.tsx");

  assert.doesNotMatch(
    clientSource,
    /SHOW_ENTRY_BOARD_PANEL/,
    "Hard-disabled feature flags should not leave inactive JSX in the public match client bundle"
  );
  assert.doesNotMatch(
    clientSource,
    /EntryBoardSidePanel/,
    "The inactive entry-board side panel should stay out of the shipped match client module"
  );
  assert.doesNotMatch(
    clientSource,
    /\b(?:MonitorUp|RadioTower|LayoutPanelLeft|Link2)\b/,
    "Icons used only by the inactive entry-board panel should not be imported by the match client"
  );
});

test("public matchup players API exposes CDN cache headers for fallback loads", () => {
  const routeSource = readProjectFile("app/api/players/route.ts");

  assert.match(routeSource, /export\s+const\s+revalidate\s*=\s*300/);
  assert.match(routeSource, /Cache-Control/);
  assert.match(routeSource, /s-maxage=300,\s*stale-while-revalidate=31536000/);
});
