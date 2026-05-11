const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");

const repoRoot = path.resolve(__dirname, "..", "..");
const componentPath = path.join(repoRoot, "app", "admin", "prediction", "PredictionMatchAdmin.tsx");

function readComponentSource() {
  return fs.readFileSync(componentPath, "utf8");
}

function extractEntryMatchupSection(source) {
  const start = source.indexOf("const matchups = normalizeEntryMatchups");
  const end = source.indexOf("<aside", start);
  assert.notEqual(start, -1, "entry matchup source boundary must start at matchups setup");
  assert.notEqual(end, -1, "entry matchup source boundary must end before aside");
  return source.slice(start, end);
}

test("admin entry matchup picker is scoped to the players already added to each team", () => {
  const source = readComponentSource();
  const section = extractEntryMatchupSection(source);

  assert.match(source, /function getSelectedTeamPlayers\(/);
  assert.match(source, /normalizePlayerSlots\(playerIds\)/);
  assert.match(source, /function EntryMatchupPlayerSelect\(/);

  assert.match(section, /const teamAEntryPlayers = getSelectedTeamPlayers\(playerMap, selectedMatch\?\.team_a_player_ids\)/);
  assert.match(section, /const teamBEntryPlayers = getSelectedTeamPlayers\(playerMap, selectedMatch\?\.team_b_player_ids\)/);
  assert.match(section, /players=\{teamAEntryPlayers\}/);
  assert.match(section, /players=\{teamBEntryPlayers\}/);
  assert.doesNotMatch(section, /<PlayerSearchInput/);
});

test("admin entry matchup picker uses a large select layout with clear empty-team affordance", () => {
  const source = readComponentSource();

  assert.match(source, /function EntryMatchupPlayerSelect\(/);
  assert.match(source, /<select/);
  assert.match(source, /disabled=\{players\.length === 0\}/);
  assert.match(source, /players\.length === 0 \? `\$\{sideLabel\}/);
  assert.match(source, /grid gap-3 rounded-xl/);
  assert.match(source, /md:grid-cols-\[120px_minmax\(0,1fr\)_48px_minmax\(0,1fr\)_84px\]/);
});

test("admin entry order status is selected with explicit unknown and confirmed controls", () => {
  const source = readComponentSource();
  const section = extractEntryMatchupSection(source);

  assert.match(section, /const entryOrderStatus = normalizeEntryOrderStatus\(selectedMatch\?\.entry_order_status\)/);
  assert.match(source, /const setEntryOrderStatus = \(entryOrderStatus: EntryOrderStatus\) =>/);
  assert.ok(source.includes("\uC21C\uC11C \uBBF8\uC815"), "unknown-order control should be visible");
  assert.ok(source.includes("\uC21C\uC11C \uD655\uC815"), "confirmed-order control should be visible");
  assert.ok(
    !source.includes("\uC21C\uC11C \uBBF8\uC815/\uD655\uC815 \uC804\uD658"),
    "ambiguous toggle label should not remain"
  );
  assert.match(section, /aria-pressed=\{entryOrderStatus === "unknown"\}/);
  assert.match(section, /aria-pressed=\{entryOrderStatus === "confirmed"\}/);
  assert.match(section, /onClick=\{\(\) => setEntryOrderStatus\("unknown"\)\}/);
  assert.match(section, /onClick=\{\(\) => setEntryOrderStatus\("confirmed"\)\}/);
});
