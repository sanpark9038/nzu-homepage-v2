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
  const proxySource = readProjectFile("proxy.ts");

  assert.doesNotMatch(defaultRouteSource, /searchParams/);
  assert.doesNotMatch(defaultRouteSource, /playerService\.getLivePlayers\(\)/);
  assert.doesNotMatch(defaultRouteSource, /export\s+const\s+dynamic\s*=\s*"force-dynamic"/);
  assert.match(defaultRouteSource, /export\s+const\s+revalidate\s*=\s*60/);
  assert.doesNotMatch(defaultRouteSource, /export\s+const\s+revalidate\s*=\s*0/);
  assert.match(defaultRouteSource, /<TierPageView\s*\/>/);

  assert.match(queryRouteSource, /searchParams/);
  assert.match(queryRouteSource, /<TierPageView\s+params=\{params\}\s*\/>/);

  assert.match(viewSource, /playerService\.getCachedPlayersList\(\)/);
  assert.match(viewSource, /playerService\.getLivePlayers\(\)/);
  assert.doesNotMatch(viewSource, /playerService\.getAllPlayers\(\)/);
  assert.match(viewSource, /import\s+\{\s*Suspense\s*\}\s+from\s+["']react["']/);
  assert.match(viewSource, /<Suspense\s+fallback=/);
  assert.match(
    viewSource,
    /liveOnly\s*\?\s*playerService\.getLivePlayers\(\)\s*:\s*playerService\.getCachedPlayersList\(\)/s
  );

  assert.match(proxySource, /NextResponse\.rewrite/);
  assert.match(proxySource, /\/tier\/query/);
  assert.match(proxySource, /source:\s*["']\/tier["']/);
  assert.match(proxySource, /type:\s*["']query["'],\s*key:\s*["']liveOnly["']/);
  assert.match(proxySource, /type:\s*["']query["'],\s*key:\s*["']univ["']/);
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

test("tier filters use full tier URL navigation so query routes render server-filtered data", () => {
  const source = readProjectFile("components/players/Filters.tsx");

  assert.match(source, /function navigateTierFilters/);
  assert.match(source, /window\.location\.assign\(target\)/);
  assert.match(source, /const target = query \? `\/tier\?\$\{query\}` : "\/tier"/);
  assert.doesNotMatch(source, /router\.push\(`\?\$\{params\.toString\(\)\}`/);
});

test("tier lightweight card keeps compact profile media and shows live thumbnail as a hover preview without hydrating the shared card", () => {
  const source = readProjectFile("components/players/TierPlayerCard.tsx");

  assert.match(source, /from ["']next\/image["']/);
  assert.match(source, /resolveSoopChannelImageUrl/);
  assert.match(source, /buildSoopThumbnailProxyUrl/);
  assert.match(source, /const liveThumbnailUrl = /);
  assert.doesNotMatch(source, /const mediaUrl = liveThumbnailUrl \|\| profileUrl/);
  assert.match(source, /src=\{profileUrl\}/);
  assert.match(source, /src=\{liveThumbnailUrl\}/);
  assert.match(source, /data-live-thumbnail-hover-preview/);
  assert.match(source, /group-hover:opacity-100/);
  assert.match(source, /bottom-\[calc\(100%\+0\.75rem\)\]/);
  assert.match(source, /w-\[34rem\]/);
  assert.doesNotMatch(source, /w-\[22rem\]/);
  assert.match(source, /absolute right-3 top-3/);
  assert.doesNotMatch(source, /shrink-0 rounded-full bg-red-600 px-2 py-0\.5/);
  assert.doesNotMatch(source, /aria-label=\{`\$\{player\.name\} live thumbnail`\}/);
  assert.doesNotMatch(source, /block aspect-video overflow-hidden/);
  assert.match(source, /<Image\b/);
  assert.match(source, /width=\{76\}/);
  assert.match(source, /height=\{76\}/);
  assert.match(source, /fill/);
  assert.match(source, /unoptimized/);
  assert.match(source, /player\.name\.slice\(0,\s*1\)/);
  assert.doesNotMatch(source, /sizes=["']56px["']/);
  assert.doesNotMatch(source, /from ["']\.\/PlayerCard["']/);
});
