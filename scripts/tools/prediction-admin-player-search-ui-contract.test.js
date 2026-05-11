const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");

const repoRoot = path.resolve(__dirname, "..", "..");
const componentPath = path.join(repoRoot, "app", "admin", "prediction", "PredictionMatchAdmin.tsx");

function readComponentSource() {
  return fs.readFileSync(componentPath, "utf8");
}

function extractPlayerSearchInput(source) {
  const start = source.indexOf("function PlayerSearchInput(");
  const nextComponent = source.indexOf("\n\nfunction EntryMatchupPlayerSelect", start);
  const exportStart = source.indexOf("\n\nexport function PredictionMatchAdmin", start);
  const end = nextComponent === -1 ? exportStart : nextComponent;
  assert.notEqual(start, -1, "PlayerSearchInput must exist");
  assert.notEqual(end, -1, "PlayerSearchInput source boundary must stay findable");
  return source.slice(start, end);
}

test("admin prediction player picker uses bounded custom search results instead of native datalist", () => {
  const source = readComponentSource();
  const component = extractPlayerSearchInput(source);

  assert.doesNotMatch(component, /<datalist\b/);
  assert.doesNotMatch(component, /<\/datalist>/);
  assert.doesNotMatch(component, /<option\b/);
  assert.doesNotMatch(component, /\blist=\{/);
  assert.doesNotMatch(component, /\blistId\b/);

  assert.match(source, /const\s+PLAYER_SEARCH_RESULT_LIMIT\s*=\s*8\b/);
  assert.match(source, /function\s+getPlayerSearchResults\s*\(/);
  assert.match(source, /\.slice\(\s*0\s*,\s*PLAYER_SEARCH_RESULT_LIMIT\s*\)/);
  assert.match(source, /if\s*\(\s*!query\s*\)\s*return\s+\[\]/);

  assert.match(component, /role="listbox"/);
  assert.match(component, /role="option"/);
  assert.match(component, /visibleResults/);
});

test("admin prediction player picker searches all visible player identity fields", () => {
  const source = readComponentSource();
  const searchStart = source.indexOf("function getPlayerSearchResults(");
  const searchEnd = source.indexOf("\n\nfunction getTeamName", searchStart);
  assert.notEqual(searchStart, -1, "getPlayerSearchResults must exist");
  assert.notEqual(searchEnd, -1, "getPlayerSearchResults source boundary must stay findable");
  const searchSource = source.slice(searchStart, searchEnd);

  for (const field of ["id", "name", "nickname", "race", "tier"]) {
    assert.match(searchSource, new RegExp(`player\\.${field}\\b`));
  }
});

test("admin prediction player picker exposes active-result keyboard navigation", () => {
  const source = readComponentSource();
  const component = extractPlayerSearchInput(source);

  assert.match(component, /activeResultIndex/);
  assert.match(component, /setActiveResultIndex/);
  assert.match(component, /event\.key\s*===\s*"ArrowDown"/);
  assert.match(component, /event\.key\s*===\s*"ArrowUp"/);
  assert.match(component, /aria-activedescendant/);
  assert.match(component, /activeResultId/);
  assert.match(component, /visibleResults\[activeResultIndex\]/);
});

test("admin prediction player picker resets unmatched blur text to the current selection", () => {
  const source = readComponentSource();
  const component = extractPlayerSearchInput(source);

  assert.match(component, /resetQueryToSelectedPlayer/);
  assert.match(component, /setQuery\(player\?\.name\s*\|\|\s*""\)/);
  assert.match(component, /const\s+isExactQueryMatch\s*=/);
  assert.match(component, /if\s*\(\s*!isExactQueryMatch\s*\)\s*{/);
  assert.match(component, /resetQueryToSelectedPlayer\(\)/);
});
