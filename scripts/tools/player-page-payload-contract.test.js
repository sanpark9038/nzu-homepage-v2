const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");

const repoRoot = path.resolve(__dirname, "..", "..");

function readProjectFile(filePath) {
  return fs.readFileSync(path.join(repoRoot, filePath), "utf8");
}

test("player detail page does not pass unbounded match logs to the client component", () => {
  const source = readProjectFile("lib/player-detail-summary.ts");

  assert.match(source, /PLAYER_DETAIL_RECENT_LOG_LIMIT\s*=\s*25/);
  assert.match(
    source,
    /recentLogs:\s*buildRecentLogs\(exactMatchMatches,\s*player\.id\)\.slice\(0,\s*PLAYER_DETAIL_RECENT_LOG_LIMIT\)/,
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

test("exact player search defers full match-summary work until detail is expanded", () => {
  const source = readProjectFile("app/player/player-page-view.tsx");

  assert.match(
    source,
    /import\s*{[\s\S]*buildPlayerDetailSummary[\s\S]*getEmptyPlayerDetailSummary[\s\S]*}\s*from\s*["']@\/lib\/player-detail-summary["']/,
    "PlayerPageView should delegate heavy detail-summary construction to a shared helper"
  );
  assert.doesNotMatch(
    source,
    /if\s*\(\s*exactMatch\s*\)\s*{[\s\S]*?playerService\.getPlayerMatches\(/,
    "Exact search should not unconditionally fetch full player matches before first render"
  );
  assert.match(
    source,
    /if\s*\(\s*exactMatch\s*&&\s*shouldExpandDetailByDefault\s*\)\s*{[\s\S]*?buildPlayerDetailSummary\(exactMatch\)/,
    "Only explicitly expanded detail routes should preload the heavy match summary"
  );
});

test("collapsed player cards lazy-load detail summaries through a focused API route", () => {
  const resultSource = readProjectFile("app/player/PlayerSearchResult.tsx");
  const routeSource = readProjectFile("app/api/player-detail-summary/route.ts");

  assert.match(resultSource, /detailSummaryEndpoint\?:\s*string/);
  assert.match(resultSource, /useEffect\(/);
  assert.match(
    resultSource,
    /fetch\(detailSummaryEndpoint/,
    "The client card should request detail summaries only after expansion"
  );
  assert.match(
    routeSource,
    /getCachedPlayerDetailSummaryById\(playerId\)/,
    "The route should serve cached player detail summaries by player id"
  );
  assert.match(
    routeSource,
    /NextResponse\.json\(summary\)/,
    "The route should return only the summary payload needed by the expanded card"
  );
});

test("collapsed exact player cards seed recent metrics from precomputed detailed stats", () => {
  const viewSource = readProjectFile("app/player/player-page-view.tsx");
  const summarySource = readProjectFile("lib/player-detail-summary.ts");

  assert.match(
    viewSource,
    /getPrecomputedPlayerDetailSummary/,
    "PlayerPageView should seed the collapsed card from precomputed player detailed_stats"
  );
  assert.match(
    viewSource,
    /detailSummary\s*=\s*getPrecomputedPlayerDetailSummary\(exactMatch\)/,
    "Collapsed exact-search cards should receive precomputed recent metrics before expansion"
  );
  assert.match(
    summarySource,
    /recent_90/,
    "The precomputed summary helper should read the recent_90 serving projection"
  );
  assert.match(
    summarySource,
    /last_10/,
    "The precomputed summary helper should reuse the existing last_10 form projection"
  );
});

test("expanded player detail summaries use fresh precomputed detail report before full history reads", () => {
  const summarySource = readProjectFile("lib/player-detail-summary.ts");

  assert.match(
    summarySource,
    /getPrecomputedFullPlayerDetailSummary/,
    "Expanded detail summaries should have a full precomputed fast path"
  );
  assert.match(
    summarySource,
    /player_detail_summary/,
    "The full precomputed fast path should read detailed_stats.player_detail_summary"
  );
  assert.match(
    summarySource,
    /latest_match_date/,
    "The precomputed detail report should carry a freshness date"
  );
  assert.match(
    summarySource,
    /last_match_at/,
    "The precomputed detail report should be compared against the player row freshness"
  );

  const buildStart = summarySource.indexOf("export async function buildPlayerDetailSummary");
  const buildEnd = summarySource.indexOf("export const getCachedPlayerDetailSummaryById", buildStart);
  assert.notEqual(buildStart, -1);
  assert.notEqual(buildEnd, -1);

  const buildSource = summarySource.slice(buildStart, buildEnd);
  assert.match(buildSource, /getPrecomputedFullPlayerDetailSummary\(player\)/);
  assert.ok(
    buildSource.indexOf("getPrecomputedFullPlayerDetailSummary(player)") < buildSource.indexOf("playerService.getPlayerMatches"),
    "The precomputed fast path should run before the full match-history read"
  );
});

test("player card payload strips bulky precomputed stats after seeding summaries", () => {
  const viewSource = readProjectFile("app/player/player-page-view.tsx");
  const seedIndex = viewSource.indexOf("getPrecomputedPlayerDetailSummary(exactMatch)");
  const propIndex = viewSource.indexOf("player={buildPlayerCardPayload(exactMatch)}");

  assert.match(
    viewSource,
    /function\s+buildPlayerCardPayload\(player:\s*Player\)/,
    "PlayerPageView should have a focused helper for client-safe player card payloads"
  );
  assert.match(
    viewSource,
    /detailed_stats:\s*null/,
    "The player card payload should not ship bulky precomputed detailed_stats to the client"
  );
  assert.match(
    viewSource,
    /match_history:\s*null/,
    "The player card payload should also clear match_history defensively"
  );
  assert.notEqual(seedIndex, -1);
  assert.notEqual(propIndex, -1);
  assert.ok(
    seedIndex < propIndex,
    "The server should seed summaries from detailed_stats before stripping the client player payload"
  );
});
