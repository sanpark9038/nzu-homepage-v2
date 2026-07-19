const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");

const repoRoot = path.resolve(__dirname, "..", "..");

function readProjectFile(filePath) {
  return fs.readFileSync(path.join(repoRoot, filePath), "utf8");
}

test("tier default route is cacheable while query URLs keep filtered/live behavior", () => {
  const defaultRouteSource = readProjectFile("app/tier/page.tsx");
  const queryRouteSource = readProjectFile("app/tier/query/page.tsx");
  const viewSource = readProjectFile("app/tier/TierPageView.tsx");
  const clientViewSource = readProjectFile("app/tier/TierClientView.tsx");
  const apiRouteSource = readProjectFile("app/api/tier/players/route.ts");
  const proxySource = readProjectFile("proxy.ts");

  assert.doesNotMatch(defaultRouteSource, /searchParams/);
  assert.doesNotMatch(defaultRouteSource, /playerService\.getLivePlayers\(\)/);
  assert.doesNotMatch(defaultRouteSource, /export\s+const\s+dynamic\s*=\s*"force-dynamic"/);
  assert.match(defaultRouteSource, /export\s+const\s+revalidate\s*=\s*60/);
  assert.doesNotMatch(defaultRouteSource, /export\s+const\s+revalidate\s*=\s*0/);
  assert.match(defaultRouteSource, /<TierPageView\s*\/>/);

  assert.match(queryRouteSource, /searchParams/);
  assert.match(queryRouteSource, /<TierPageView\s+params=\{params\}\s*\/>/);

  assert.match(viewSource, /TierClientView/);
  assert.match(viewSource, /getUniversityOptionsFromDB\(\)/);
  assert.doesNotMatch(viewSource, /playerService\.getCachedPlayersList\(\)/);
  assert.doesNotMatch(viewSource, /playerService\.getLivePlayers\(\)/);
  assert.doesNotMatch(viewSource, /<TierGroup\b/);
  assert.doesNotMatch(viewSource, /<TeamTierCompactGrid\b/);
  assert.doesNotMatch(viewSource, /<TierPlayerCard\b/);
  assert.doesNotMatch(viewSource, /<H2HSelectorBar\b/);
  assert.match(viewSource, /const queryString = /);
  assert.match(viewSource, /queryString=\{queryString\}/);

  assert.match(clientViewSource, /"use client"/);
  assert.match(clientViewSource, /\/api\/tier\/players/);
  assert.match(clientViewSource, /fetch\(apiUrl/);
  assert.match(clientViewSource, /tierPlayersRequestCache/);
  assert.match(clientViewSource, /TIER_LIVE_REQUEST_CACHE_MS = 5_000/);
  assert.match(clientViewSource, /TIER_STATIC_REQUEST_CACHE_MS = 5 \* 60 \* 1000/);
  assert.match(clientViewSource, /type TierPlayersCacheEntry/);
  assert.match(clientViewSource, /function loadTierPlayers/);
  assert.match(clientViewSource, /unpackTierPlayersPayload/);
  assert.match(clientViewSource, /tierPlayersRequestCache\.get\(apiUrl\)/);
  assert.match(clientViewSource, /cachedRequest\.expiresAt > now/);
  assert.match(clientViewSource, /tierPlayersRequestCache\.delete\(apiUrl\)/);
  assert.match(clientViewSource, /tierPlayersRequestCache\.set\(apiUrl,\s*\{/);
  assert.match(clientViewSource, /expiresAt: now \+ cacheTtlMs/);
  assert.match(clientViewSource, /activeQueryString/);
  assert.match(clientViewSource, /useState\(\(\) => readBrowserQueryString\(queryString\)\)/);
  assert.doesNotMatch(clientViewSource, /playerNames:\s*string\[\]/);
  assert.match(clientViewSource, /const playerNames = useMemo\(\(\) => playerList\.map/);
  assert.match(clientViewSource, /<PlayerSearch playerNames=\{playerNames\}/);
  assert.match(clientViewSource, /tier-filter-query-change/);
  assert.match(clientViewSource, /window\.location\.search/);
  assert.match(clientViewSource, /const syncFromLocation = \(\) => setActiveQueryString\(readBrowserQueryString\(queryString\)\)/);
  assert.match(clientViewSource, /addEventListener\("popstate"/);
  assert.match(clientViewSource, /buildTierApiUrl\(activeQueryString\)/);
  assert.match(clientViewSource, /queryString=\{activeQueryString\}/);
  assert.match(clientViewSource, /TierGroup/);
  assert.match(clientViewSource, /TeamTierCompactGrid/);
  assert.match(clientViewSource, /H2HSelectorBar/);
  assert.match(clientViewSource, /const liveOnly = params\.get\("liveOnly"\) !== "false"/);

  assert.match(apiRouteSource, /NextResponse\.json/);
  assert.match(apiRouteSource, /export\s+const\s+revalidate\s*=\s*60/);
  assert.match(apiRouteSource, /playerService\.getCachedPlayersList\(\)/);
  assert.match(apiRouteSource, /playerService\.getLivePlayers\(\)/);
  assert.match(apiRouteSource, /buildPackedTierPlayersPayload/);
  assert.match(apiRouteSource, /buildPackedTierPlayersPayload\(players,\s*\{/);
  assert.doesNotMatch(apiRouteSource, /players:\s*players\.map\(buildTierPlayerPayload\)/);
  assert.doesNotMatch(apiRouteSource, /broadcast_title:\s*player\.broadcast_title/);
  assert.doesNotMatch(apiRouteSource, /channel_profile_image_url:\s*player\.channel_profile_image_url/);
  assert.doesNotMatch(apiRouteSource, /live_thumbnail_url:\s*player\.live_thumbnail_url/);
  assert.doesNotMatch(apiRouteSource, /photo_url:\s*player\.photo_url/);
  assert.doesNotMatch(apiRouteSource, /playerNames:/);
  assert.doesNotMatch(apiRouteSource, /tier_rank: player\.tier_rank/);
  assert.doesNotMatch(apiRouteSource, /eloboard_id: player\.eloboard_id/);
  assert.doesNotMatch(apiRouteSource, /soop_id: player\.soop_id/);
  assert.doesNotMatch(apiRouteSource, /broadcast_url: player\.broadcast_url/);
  assert.doesNotMatch(apiRouteSource, /elo_point: player\.elo_point/);
  assert.doesNotMatch(apiRouteSource, /total_wins: player\.total_wins/);
  assert.doesNotMatch(apiRouteSource, /total_losses: player\.total_losses/);
  assert.doesNotMatch(apiRouteSource, /win_rate: player\.win_rate/);
  assert.match(apiRouteSource, /s-maxage=10,\s*stale-while-revalidate=60/);
  assert.match(apiRouteSource, /s-maxage=300,\s*stale-while-revalidate=31536000/);
  assert.doesNotMatch(viewSource, /playerService\.getAllPlayers\(\)/);
  assert.doesNotMatch(viewSource, /import\s+\{\s*Suspense\s*\}\s+from\s+["']react["']/);
  assert.doesNotMatch(viewSource, /<Suspense\s+fallback=/);
  assert.doesNotMatch(viewSource, /fade-in/);
  assert.doesNotMatch(viewSource, /group-hover:scale/);
  assert.match(
    apiRouteSource,
    /liveOnly\s*\?\s*playerService\.getLivePlayers\(\)\s*:\s*playerService\.getCachedPlayersList\(\)/s
  );

  assert.match(proxySource, /NextResponse\.rewrite/);
  assert.doesNotMatch(proxySource, /pathname === "\/tier"/);
  assert.doesNotMatch(proxySource, /\/tier\/query/);
  assert.doesNotMatch(proxySource, /source:\s*["']\/tier["']/);
  assert.doesNotMatch(proxySource, /type:\s*["']query["'],\s*key:\s*["']liveOnly["']/);
  assert.doesNotMatch(proxySource, /type:\s*["']query["'],\s*key:\s*["']univ["']/);
});

test("tier grids use a lightweight tier card instead of hydrating the shared player card", () => {
  const tierGroupSource = readProjectFile("components/players/TierGroup.tsx");
  const compactGridSource = readProjectFile("components/players/TeamTierCompactGrid.tsx");

  assert.match(tierGroupSource, /TierPlayerCard/);
  assert.match(compactGridSource, /TierPlayerCard/);
  assert.doesNotMatch(tierGroupSource, /<PlayerCard\b/);
  assert.doesNotMatch(compactGridSource, /<PlayerCard\b/);
});

test("tier live player service uses a short cached live-player query", () => {
  const source = readProjectFile("lib/player-service.ts");
  const methodStart = source.indexOf("async getLivePlayers");
  const methodEnd = source.indexOf("async getPlayerMatches", methodStart);

  assert.notEqual(methodStart, -1);
  assert.notEqual(methodEnd, -1);

  assert.match(source, /const fetchCachedLivePlayersForList = unstable_cache/);
  assert.match(source, /\["public-live-players-list-v1"\]/);
  assert.match(source, /revalidate:\s*60/);
  assert.match(source, /tags:\s*\["public-live-players-list"\]/);

  const methodSource = source.slice(methodStart, methodEnd);
  assert.match(methodSource, /return\s+fetchCachedLivePlayersForList\(\)/);
  assert.doesNotMatch(
    methodSource,
    /\.from\("players"\)[\s\S]*?\.select\(PLAYER_LIST_SELECT\[0\]\)/,
    "Tier live API should go through the short live-player data cache"
  );
});

test("tier groups defer offscreen layout and paint work without removing cards from the DOM", () => {
  const tierGroupSource = readProjectFile("components/players/TierGroup.tsx");
  const globalsSource = readProjectFile("app/globals.css");

  assert.match(tierGroupSource, /tier-content-visibility/);
  assert.doesNotMatch(tierGroupSource, /IntersectionObserver/);
  assert.doesNotMatch(tierGroupSource, /slice\(/);
  assert.doesNotMatch(tierGroupSource, /players\.filter\([^)]*index/);
  assert.match(globalsSource, /\.tier-content-visibility/);
  assert.match(globalsSource, /content-visibility:\s*auto/);
  assert.match(globalsSource, /contain-intrinsic-size:\s*auto\s+44rem/);
});

test("tier h2h selector accepts lightweight matchup summaries", () => {
  const source = readProjectFile("components/players/H2HSelectorBar.tsx");

  assert.match(source, /MatchupPlayerSummary/);
  assert.doesNotMatch(source, /from ['"]\.\/PlayerCard['"]/);
  assert.doesNotMatch(source, /CustomEvent<Player>/);
});

test("tier filters update the visible URL without remounting the client tier shell", () => {
  const source = readProjectFile("components/players/Filters.tsx");

  assert.match(source, /function navigateTierFilters/);
  assert.match(source, /playerNames/);
  assert.match(source, /\.some\(\(name\)/);
  assert.match(source, /if \(lowerTerm && hasMatch\) \{/);
  assert.doesNotMatch(source, /useRouter/);
  assert.doesNotMatch(source, /useSearchParams/);
  assert.match(source, /queryString/);
  assert.match(source, /window\.history\.pushState\(null,\s*"",\s*target\)/);
  assert.match(source, /tier-filter-query-change/);
  assert.match(source, /queryString: query/);
  assert.match(source, /const target = query \? `\/tier\?\$\{query\}` : "\/tier"/);
  assert.match(source, /get\("liveOnly"\) !== "false"/);
  assert.match(source, /params\.set\("liveOnly", "false"\)/);
  assert.doesNotMatch(source, /params\.set\("liveOnly", "true"\)/);
  assert.doesNotMatch(source, /window\.location\.assign/);
  assert.doesNotMatch(source, /router\.push/);
  assert.doesNotMatch(source, /router\.refresh\(\)/);
  assert.doesNotMatch(source, /router\.push\(`\?\$\{params\.toString\(\)\}`/);
  assert.doesNotMatch(source, /scale-105/);
});

test("tier lightweight card keeps compact profile media and delegates live hover preview without hydrating the shared card", () => {
  const source = readProjectFile("components/players/TierPlayerCard.tsx");
  const badgeSource = readProjectFile("components/ui/nzu-badges.tsx");
  const quickH2HButtonSource = readProjectFile("components/players/TierQuickH2HButton.tsx");
  const h2hSelectorSource = readProjectFile("components/players/H2HSelectorBar.tsx");

  assert.match(source, /from ["']next\/image["']/);
  assert.doesNotMatch(source, /TierLiveHoverPreview/);
  assert.match(source, /resolveSoopChannelImageUrl/);
  assert.match(source, /normalizeSoopImageUrl/);
  assert.match(source, /const liveThumbnailUrl = /);
  assert.doesNotMatch(source, /const mediaUrl = liveThumbnailUrl \|\| profileUrl/);
  assert.match(source, /src=\{profileUrl\}/);
  assert.doesNotMatch(source, /src=\{liveThumbnailUrl\}/);
  assert.match(source, /data-live-thumbnail-hover-anchor/);
  assert.match(source, /data-live-thumbnail-url=\{liveThumbnailUrl \|\| undefined\}/);
  assert.match(source, /data-live-player-name=\{player\.name\}/);
  assert.match(source, /data-live-broadcast-title=\{player\.broadcast_title \|\| undefined\}/);
  assert.doesNotMatch(source, /data-live-thumbnail-hover-preview/);
  assert.doesNotMatch(source, /w-\[22rem\]/);
  assert.match(source, /max-w-56/);
  assert.match(source, /absolute right-2 top-2/);
  assert.match(source, /flex items-center gap-1 overflow-hidden pl-\[5\.25rem\]/);
  assert.match(badgeSource, /sm:\s*["']text-\[11px\] px-2\.5 py-\[0\.35rem\] rounded-lg["']/);
  assert.doesNotMatch(source, /shrink-0 rounded-full bg-red-600 px-2 py-0\.5/);
  assert.doesNotMatch(source, /aria-label=\{`\$\{player\.name\} live thumbnail`\}/);
  assert.doesNotMatch(source, /block aspect-video overflow-hidden/);
  assert.match(source, /<Image\b/);
  assert.match(source, /width=\{76\}/);
  assert.match(source, /height=\{76\}/);
  assert.match(source, /sizes=["']76px["']/);
  assert.doesNotMatch(source, /shadow-/);
  assert.doesNotMatch(source, /shadow-\[/);
  assert.doesNotMatch(source, /ring-offset-/);
  assert.doesNotMatch(source, /ring-red-/);
  assert.doesNotMatch(source, /\[box-shadow:/);
  assert.match(source, /aria-hidden="true"/);
  assert.match(source, /absolute inset-0 rounded-2xl border-2 border-red-500\/90/);
  assert.match(source, /m-\[4px\]/);
  assert.match(source, /w-\[calc\(100%-0\.5rem\)\]/);
  assert.doesNotMatch(source, /transition-all/);
  assert.doesNotMatch(source, /group-hover:-translate-y/);
  assert.doesNotMatch(source, /group-hover:scale/);
  assert.match(source, /player\.name\.slice\(0,\s*1\)/);
  assert.doesNotMatch(source, /sizes=["']56px["']/);
  assert.doesNotMatch(source, /from ["']\.\/PlayerCard["']/);
  assert.match(source, /TierQuickH2HButton/);
  assert.doesNotMatch(quickH2HButtonSource, /"use client"/);
  assert.doesNotMatch(quickH2HButtonSource, /window\.dispatchEvent/);
  assert.doesNotMatch(quickH2HButtonSource, /onClick=/);
  assert.match(quickH2HButtonSource, /from ["']lucide-react["']/);
  assert.match(quickH2HButtonSource, /import\s+\{\s*Plus\s*\}\s+from ["']lucide-react["']/);
  assert.doesNotMatch(quickH2HButtonSource, /\bCircle\b/);
  assert.doesNotMatch(quickH2HButtonSource, /\bCheck\b/);
  assert.match(quickH2HButtonSource, /data-tier-h2h-player/);
  assert.match(quickH2HButtonSource, /data-player-id=\{player\.id\}/);
  assert.match(quickH2HButtonSource, /data-player-name=\{player\.name\}/);
  assert.match(quickH2HButtonSource, /data-player-race=\{player\.race\}/);
  assert.match(quickH2HButtonSource, /data-player-tier=\{player\.tier\}/);
  assert.match(h2hSelectorSource, /data-tier-h2h-player/);
  assert.match(h2hSelectorSource, /\.closest\(/);
  assert.match(h2hSelectorSource, /add-h2h-player/);
});

test("tier live hover preview uses one delegated fixed layer and lazy-mounts the image", () => {
  const clientViewSource = readProjectFile("app/tier/TierClientView.tsx");
  const source = readProjectFile("components/players/TierLiveHoverPreview.tsx");

  assert.match(source, /"use client"/);
  assert.match(clientViewSource, /TierLiveHoverPreviewLayer/);
  assert.match(clientViewSource, /<TierLiveHoverPreviewLayer\s*\/>/);
  assert.match(source, /export function TierLiveHoverPreviewLayer/);
  assert.match(source, /createPortal/);
  assert.match(source, /useState\(false\)/);
  assert.match(source, /document\.addEventListener\("pointerover"/);
  assert.match(source, /document\.addEventListener\("pointerout"/);
  assert.match(source, /document\.addEventListener\("focusin"/);
  assert.match(source, /document\.addEventListener\("focusout"/);
  assert.match(source, /closest\(\s*["']\[data-live-thumbnail-hover-anchor\]["']/);
  assert.match(source, /dataset\.liveThumbnailUrl/);
  assert.match(source, /dataset\.livePlayerName/);
  assert.match(source, /dataset\.liveBroadcastTitle/);
  assert.doesNotMatch(source, /parent\.addEventListener/);
  assert.doesNotMatch(source, /rootRef/);
  assert.match(source, /focusin/);
  assert.match(source, /focusout/);
  assert.match(source, /shouldRender/);
  assert.match(source, /loadedThumbnailUrl/);
  assert.match(source, /activeThumbnailUrlRef/);
  assert.match(source, /previewPosition/);
  assert.match(source, /getPreviewPosition/);
  assert.match(source, /data-live-thumbnail-hover-preview/);
  assert.match(source, /position:\s*"fixed"/);
  assert.match(source, /z-\[999\]/);
  assert.match(source, /document\.body/);
  assert.doesNotMatch(source, /group-hover:opacity-100/);
  assert.doesNotMatch(source, /bottom-\[calc\(100%\+0\.75rem\)\]/);
  assert.doesNotMatch(source, /absolute bottom/);
  assert.match(source, /src=\{preview\.thumbnailUrl\}/);
  assert.match(source, /key=\{preview\.thumbnailUrl\}/);
  assert.match(source, /onLoad=\{\(\) => setLoadedThumbnailUrl\(preview\.thumbnailUrl\)\}/);
  assert.match(source, /loadedThumbnailUrl === preview\.thumbnailUrl \? "opacity-100" : "opacity-0"/);
  assert.match(source, /fill/);
  assert.match(source, /unoptimized/);
  assert.doesNotMatch(source, /shadow-/);
  assert.doesNotMatch(source, /shadow-\[/);
});

test("tier live hover preview shows readable fallback content before thumbnail load", () => {
  const source = readProjectFile("components/players/TierLiveHoverPreview.tsx");

  assert.match(source, /live-thumbnail-loading-placeholder/);
  assert.match(source, /loadedThumbnailUrl !== preview\.thumbnailUrl/);
  assert.match(source, /\\uBBF8\\uB9AC\\uBCF4\\uAE30 \\uBD88\\uB7EC\\uC624\\uB294 \\uC911/);
  assert.match(source, /previewTitle/);
  assert.match(source, /preview\.playerName/);
  assert.match(source, /animate-pulse/);
});

test("tier footer exposes a short admin entry without leaking credentials", () => {
  const source = readProjectFile("app/tier/TierClientView.tsx");
  const adminEntrySource = readProjectFile("app/admin/page.tsx");

  assert.match(source, /href=["']\/admin["']/);
  assert.match(source, /LockKeyhole/);
  assert.match(source, /\\uC804\\uC801 \\uCD9C\\uCC98: ELOBOARD\.COM|전적 출처:\s*ELOBOARD\.COM/);
  assert.match(source, /HOSAGA BY 엘레이드/);
  assert.doesNotMatch(source, /HOSAGA ARCHIVE/);
  assert.doesNotMatch(source, /HOSAGA 티어 데이터/);
  assert.doesNotMatch(source, /ADMIN_ACCESS_KEY|adminAccessKey|password|next=\/admin/);

  assert.match(adminEntrySource, /ADMIN_SESSION_COOKIE/);
  assert.match(adminEntrySource, /isValidAdminSession/);
  assert.match(adminEntrySource, /redirect\("\/admin\/ops"\)/);
  assert.match(adminEntrySource, /redirect\("\/admin\/login\?next=\/admin\/ops"\)/);
  assert.doesNotMatch(adminEntrySource, /ADMIN_ACCESS_KEY|adminAccessKey|password/);
});
