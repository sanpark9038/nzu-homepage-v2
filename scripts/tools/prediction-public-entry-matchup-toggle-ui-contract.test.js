const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");

const repoRoot = path.resolve(__dirname, "..", "..");
const componentPath = path.join(repoRoot, "components", "prediction", "TournamentPredictionClient.tsx");

function readComponentSource() {
  return fs.readFileSync(componentPath, "utf8");
}

test("public entry matchup details are collapsed by default behind an accessible toggle", () => {
  const source = readComponentSource();

  assert.match(source, /import \{ ChevronDown \} from "lucide-react"/);
  assert.match(source, /const \[expandedEntryMatchIds, setExpandedEntryMatchIds\] = useState<Set<string>>\(\(\) => new Set\(\)\)/);
  assert.match(source, /function toggleEntryMatchups\(matchId: string\)/);
  assert.match(source, /next\.has\(matchId\)/);
  assert.match(source, /next\.delete\(matchId\)/);
  assert.match(source, /next\.add\(matchId\)/);

  assert.match(source, /const hasEntryMatchups = match\.matchType === "team" && match\.entryMatchups\.length > 0/);
  assert.match(source, /const isEntryExpanded = expandedEntryMatchIds\.has\(match\.id\)/);
  assert.match(source, /const entryMatchupPanelId = `entry-matchups-\$\{match\.id\}`/);
  assert.match(source, /aria-expanded=\{isEntryExpanded\}/);
  assert.match(source, /aria-controls=\{entryMatchupPanelId\}/);
  assert.match(source, /onClick=\{\(\) => toggleEntryMatchups\(match\.id\)\}/);
  assert.ok(source.includes("\uC0C1\uC138\uBCF4\uAE30"), "toggle must expose a detail-view label");
  assert.ok(source.includes("\uC811\uAE30"), "toggle must expose a collapse label");
  assert.match(source, /\{isEntryExpanded \? \(\s*<div\s+id=\{entryMatchupPanelId\}[\s\S]*match\.entryMatchups\.map/);
});
