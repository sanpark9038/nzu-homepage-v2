const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");

const repoRoot = path.resolve(__dirname, "..", "..");

function readProjectFile(filePath) {
  return fs.readFileSync(path.join(repoRoot, filePath), "utf8");
}

test("player detail page does not pass unbounded match logs to the client component", () => {
  const source = readProjectFile("app/player/player-page-view.tsx");

  assert.match(source, /PLAYER_DETAIL_RECENT_LOG_LIMIT\s*=\s*25/);
  assert.match(
    source,
    /recentLogs\s*=\s*buildRecentLogs\(exactMatchMatches,\s*exactMatch\.id\)\.slice\(0,\s*PLAYER_DETAIL_RECENT_LOG_LIMIT\)/,
    "PlayerSearchResult should receive a bounded recent log list instead of every historical match"
  );
});

test("canonical player slug resolution is reused by the shared player page view", () => {
  const routeSource = readProjectFile("app/player/[id]/page.tsx");
  const viewSource = readProjectFile("app/player/player-page-view.tsx");

  assert.match(routeSource, /let\s+initialPlayerForView/);
  assert.match(routeSource, /initialPlayer=\{initialPlayerForView\}/);
  assert.match(viewSource, /initialPlayer\?:\s*Player\s*\|\s*null/);
  assert.match(
    viewSource,
    /if\s*\(initialPlayer\)\s*return\s+initialPlayer/,
    "PlayerPageView should reuse the player row already fetched for canonical redirect checks"
  );
});

test("player id-prefix lookup uses the cached public player list", () => {
  const source = readProjectFile("lib/player-service.ts");
  const methodStart = source.indexOf("async getPlayerByIdPrefix");
  const methodEnd = source.indexOf("async getLivePlayers", methodStart);

  assert.notEqual(methodStart, -1);
  assert.notEqual(methodEnd, -1);

  const methodSource = source.slice(methodStart, methodEnd);
  assert.match(methodSource, /await\s+this\.getCachedPlayersList\(\)/);
  assert.doesNotMatch(
    methodSource,
    /\.from\("players"\)[\s\S]*?\.select\(PLAYER_LIST_SELECT\[0\]\)/,
    "Prefix lookup should not perform its own full Supabase list query"
  );
});
