const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");

const repoRoot = path.resolve(__dirname, "..", "..");
const PUBLIC_HREF_SCAN_EXCLUDES = new Set([
  path.join("app", "api"),
  path.join("app", "board", "query"),
  path.join("app", "player", "query"),
]);

function readProjectFile(filePath) {
  return fs.readFileSync(path.join(repoRoot, filePath), "utf8");
}

function isExcludedSource(relativePath, excludes) {
  return Array.from(excludes).some((excluded) => relativePath === excluded || relativePath.startsWith(`${excluded}${path.sep}`));
}

function listSourceFiles(relativeDir, excludes = new Set()) {
  if (isExcludedSource(relativeDir, excludes)) return [];
  const root = path.join(repoRoot, relativeDir);
  if (!fs.existsSync(root)) return [];
  const entries = fs.readdirSync(root, { withFileTypes: true });
  return entries.flatMap((entry) => {
    const relativePath = path.join(relativeDir, entry.name);
    if (entry.isDirectory()) return listSourceFiles(relativePath, excludes);
    return /\.(ts|tsx)$/.test(entry.name) ? [relativePath] : [];
  });
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

test("player base menu route is cacheable while query URLs keep search behavior", () => {
  const indexSource = readProjectFile("app/player/page.tsx");
  const querySource = readProjectFile("app/player/query/page.tsx");
  const searchFormSource = readProjectFile("app/player/PlayerSearchForm.tsx");
  const proxySource = readProjectFile("proxy.ts");

  assert.doesNotMatch(indexSource, /searchParams/);
  assert.doesNotMatch(indexSource, /unstable_noStore|noStore\(/);
  assert.doesNotMatch(indexSource, /export\s+const\s+dynamic\s*=\s*"force-dynamic"/);
  assert.doesNotMatch(indexSource, /export\s+const\s+revalidate\s*=\s*0/);
  assert.match(indexSource, /export\s+const\s+revalidate\s*=\s*300/);
  assert.match(indexSource, /<PlayerPageView\s*\/>/);

  assert.match(querySource, /searchParams/);
  assert.match(querySource, /unstable_noStore|noStore\(/);
  assert.match(querySource, /export\s+const\s+dynamic\s*=\s*"force-dynamic"/);
  assert.match(querySource, /<PlayerPageView\s+query=\{params\?\.query\}\s+selectedId=\{params\?\.id\}\s*\/>/);

  assert.match(searchFormSource, /router\.push\(`\/player\?query=\$\{encodeURIComponent\(trimmed\)\}`\)/);
  assert.doesNotMatch(searchFormSource, /\/player\?id=/);

  assert.match(proxySource, /if\s*\(pathname === "\/player"\)\s*\{[\s\S]*?rewriteUrl\.pathname\s*=\s*"\/player\/query"/);
  assert.match(proxySource, /source:\s*["']\/player["'],\s*has:\s*\[\{\s*type:\s*["']query["'],\s*key:\s*["']query["']/);
  assert.match(proxySource, /source:\s*["']\/player["'],\s*has:\s*\[\{\s*type:\s*["']query["'],\s*key:\s*["']id["']/);
  assert.doesNotMatch(proxySource, /^\s*["']\/player["']\s*,?\s*$/m);
  assert.doesNotMatch(proxySource, /\{\s*source:\s*["']\/player["']\s*,?\s*\}/);

  const publicSources = [...listSourceFiles("app", PUBLIC_HREF_SCAN_EXCLUDES), ...listSourceFiles("components"), "lib/navigation-config.ts"];
  for (const filePath of publicSources) {
    assert.doesNotMatch(readProjectFile(filePath), /["'`]\/player\/query/, `${filePath} should not expose the internal player query route`);
    assert.doesNotMatch(readProjectFile(filePath), /\/player\?id=/, `${filePath} should use canonical player hrefs instead of id query links`);
  }
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

test("player canonical redirects are not swallowed by lookup catch blocks", () => {
  const indexSource = readProjectFile("app/player/page.tsx");
  const querySource = readProjectFile("app/player/query/page.tsx");
  const routeSource = readProjectFile("app/player/[id]/page.tsx");
  const indexTryBlocks = Array.from(indexSource.matchAll(/try\s*\{([\s\S]*?)\}\s*catch/g), (match) => match[1]);
  const queryTryBlocks = Array.from(querySource.matchAll(/try\s*\{([\s\S]*?)\}\s*catch/g), (match) => match[1]);
  const routeTryBlocks = Array.from(routeSource.matchAll(/try\s*\{([\s\S]*?)\}\s*catch/g), (match) => match[1]);

  for (const block of [...indexTryBlocks, ...queryTryBlocks, ...routeTryBlocks]) {
    assert.doesNotMatch(block, /redirect\(/);
  }
  assert.match(routeSource, /if\s*\(redirectHref\)\s*redirect\(redirectHref\)/);
});

test("exact player search stays on the fast collapsed query result path", () => {
  const querySource = readProjectFile("app/player/query/page.tsx");
  const viewSource = readProjectFile("app/player/player-page-view.tsx");

  assert.doesNotMatch(
    querySource,
    /if\s*\(\s*query\s*\)\s*{[\s\S]*?redirect\(/,
    "Exact query search should not immediately redirect into the expanded dynamic player detail route"
  );
  assert.match(
    querySource,
    /return\s+<PlayerPageView\s+query=\{params\?\.query\}\s+selectedId=\{params\?\.id\}\s*\/>/,
    "Query URLs should render the shared search view so exact matches can stay collapsed"
  );
  assert.match(
    viewSource,
    /if\s*\(\s*exactMatch\s*&&\s*hasSelectedId\s*&&\s*!detailSummaryLoaded\s*\)/,
    "Only explicit selected-player routes should expand detail summaries by default"
  );

  const queryBranchStart = viewSource.indexOf("} else if (hasQuery) {");
  const queryBranchEnd = viewSource.indexOf("  }\n\n  if (exactMatch)", queryBranchStart);
  assert.notEqual(queryBranchStart, -1);
  assert.notEqual(queryBranchEnd, -1);

  const queryBranchSource = viewSource.slice(queryBranchStart, queryBranchEnd);
  assert.match(queryBranchSource, /const\s+results\s*=\s*await\s+playerService\.searchPlayers\(query\)/);
  assert.doesNotMatch(
    queryBranchSource,
    /playerService\.getPlayerById\(/,
    "Exact query search should use the cached-list search result and defer detail-row reads until expansion"
  );
});

test("player canonical redirect comparison normalizes encoded route params", () => {
  const routeSource = readProjectFile("app/player/[id]/page.tsx");

  assert.match(routeSource, /function\s+buildCurrentPlayerPath/);
  assert.match(routeSource, /decodeURIComponent\(raw\)/);
  assert.match(routeSource, /encodeURIComponent\(decodeURIComponent\(raw\)\)/);
  assert.match(routeSource, /const\s+currentPath\s*=\s*buildCurrentPlayerPath\(id\)/);
  assert.doesNotMatch(routeSource, /const\s+currentPath\s*=\s*`\/player\/\$\{encodeURIComponent\(id\)\}`/);
});

test("player search page avoids prefetching secondary player links", () => {
  const viewSource = readProjectFile("app/player/player-page-view.tsx");

  assert.match(viewSource, /href="\/tier"\s+prefetch=\{false\}/);
  assert.match(viewSource, /href=\{buildPlayerHref\(player\)\}\s+prefetch=\{false\}/);
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
    /if\s*\(\s*exactMatch\s*&&\s*hasSelectedId\s*&&\s*!detailSummaryLoaded\s*\)\s*{[\s\S]*?buildPlayerDetailSummary\(exactMatch\)/,
    "Only explicitly expanded detail routes should preload the heavy match summary"
  );
});

test("collapsed player cards can auto-load detail summaries through a focused API route", () => {
  const resultSource = readProjectFile("app/player/PlayerSearchResult.tsx");
  const viewSource = readProjectFile("app/player/player-page-view.tsx");
  const routeSource = readProjectFile("app/api/player-detail-summary/route.ts");

  assert.match(resultSource, /detailSummaryEndpoint\?:\s*string/);
  assert.match(resultSource, /loadDetailSummaryOnMount\?:\s*boolean/);
  assert.match(resultSource, /useEffect\(/);
  assert.match(
    resultSource,
    /fetch\(detailSummaryEndpoint/,
    "The client card should request detail summaries through the focused summary endpoint"
  );
  assert.match(
    resultSource,
    /isExpanded\s*\|\|\s*loadDetailSummaryOnMount/,
    "Exact query result cards should be able to fill recent metrics without forcing the expanded detail route"
  );
  assert.match(
    viewSource,
    /loadDetailSummaryOnMount=\{!detailSummaryLoaded\}/,
    "Collapsed exact query cards should auto-load the summary after the fast first paint"
  );
  assert.match(
    routeSource,
    /getCachedPlayerDetailSummaryById\(playerId\)/,
    "The route should serve cached player detail summaries by player id"
  );
  assert.match(
    routeSource,
    /NextResponse\.json\(summary/,
    "The route should return only the summary payload needed by the expanded card"
  );
});

test("player detail summary API exposes a short shared cache header", () => {
  const routeSource = readProjectFile("app/api/player-detail-summary/route.ts");

  assert.match(routeSource, /Cache-Control/);
  assert.match(routeSource, /s-maxage=300,\s*stale-while-revalidate=31536000/);
  assert.match(
    routeSource,
    /NextResponse\.json\(summary,\s*\{[\s\S]*headers:/,
    "Successful summary responses should be shared-cacheable at the HTTP layer"
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

test("player match fallback checks history artifact before lazy database match-history reads", () => {
  const source = readProjectFile("lib/player-service.ts");
  const methodStart = source.indexOf("async getPlayerMatches");
  const methodEnd = source.indexOf("async getRecentMatches", methodStart);

  assert.notEqual(methodStart, -1);
  assert.notEqual(methodEnd, -1);

  const methodSource = source.slice(methodStart, methodEnd);

  assert.match(
    source,
    /const\s+PLAYER_MATCH_HISTORY_METADATA_SELECT\s*=\s*[\s\S]*last_match_at/,
    "Player match fallback should have a lightweight player select that includes only freshness metadata"
  );
  assert.match(
    methodSource,
    /\.select\(PLAYER_MATCH_HISTORY_METADATA_SELECT\)/,
    "Player match fallback should load lightweight player metadata before resolving history"
  );
  assert.match(
    methodSource,
    /mergeDetailedH2HPlayerHistory\(/,
    "Player match fallback should reuse the artifact-first lazy history resolver"
  );
  assert.doesNotMatch(
    methodSource,
    /\.select\(PLAYER_HISTORY_SELECT\)/,
    "Player match fallback should not eagerly select the bulky match_history column"
  );
});
