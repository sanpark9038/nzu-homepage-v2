const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");

const repoRoot = path.resolve(__dirname, "..", "..");

function readProjectFile(filePath) {
  return fs.readFileSync(path.join(repoRoot, filePath), "utf8");
}

test("prediction public page and API use cached player list reads", () => {
  const pageSource = readProjectFile("app/prediction/page.tsx");
  const apiSource = readProjectFile("app/api/prediction/route.ts");

  assert.match(pageSource, /playerService\.getCachedPlayersList\(\)/);
  assert.doesNotMatch(pageSource, /playerService\.getAllPlayers\(\)/);

  assert.match(apiSource, /playerService\.getCachedPlayersList\(\)/);
  assert.doesNotMatch(apiSource, /playerService\.getAllPlayers\(\)/);
});

test("prediction public page and API use the cached tournament team config path", () => {
  const pageSource = readProjectFile("app/prediction/page.tsx");
  const apiSource = readProjectFile("app/api/prediction/route.ts");

  assert.match(pageSource, /buildTournamentHomeTeamsFromStore/);
  assert.match(pageSource, /tournamentTeams/);
  assert.match(pageSource, /buildTournamentPredictionMatches\(allPlayers,\s*state,\s*\{\s*tournamentTeams\s*,?\s*\}\)/);

  assert.match(apiSource, /buildTournamentHomeTeamsFromStore/);
  assert.match(apiSource, /tournamentTeams/);
  assert.match(apiSource, /buildTournamentPredictionMatches\(players,\s*state,\s*\{\s*tournamentTeams\s*,?\s*\}\)/);
});

test("prediction public page and API use aggregate vote totals for public reads", () => {
  const pageSource = readProjectFile("app/prediction/page.tsx");
  const apiSource = readProjectFile("app/api/prediction/route.ts");

  assert.match(pageSource, /loadPredictionState\(\{\s*includeVoteTotals: true,\s*\}\)/);
  assert.doesNotMatch(pageSource, /loadPredictionState\(\)\s*;/);

  assert.match(apiSource, /loadPredictionState\(\{\s*voterId,\s*includeVoteTotals: true,\s*\}\)/);
  assert.doesNotMatch(apiSource, /loadPredictionState\(\)\s*;/);
});

test("prediction client refreshes viewer state without overwriting server-rendered matches", () => {
  const clientSource = readProjectFile("components/prediction/TournamentPredictionClient.tsx");

  assert.match(clientSource, /fetch\("\/api\/prediction\?scope=viewer",\s*\{\s*cache:\s*"no-store"\s*\}\)/);
  assert.match(clientSource, /const refreshViewerState = async \(\) => \{/);
  assert.doesNotMatch(clientSource, /void refresh\(\);\s*const interval = window\.setInterval\(refresh, 60000\)/);
});

test("prediction API exposes a lightweight viewer scope before full match hydration", () => {
  const apiSource = readProjectFile("app/api/prediction/route.ts");
  const viewerBranchIndex = apiSource.indexOf('scope === "viewer"');
  const playerListIndex = apiSource.indexOf("playerService.getCachedPlayersList()");

  assert.notEqual(viewerBranchIndex, -1, "viewer scope branch should exist");
  assert.notEqual(playerListIndex, -1, "full public match hydration should still exist");
  assert.ok(
    viewerBranchIndex < playerListIndex,
    "viewer scope should return before loading players and building the full matches payload"
  );
  assert.match(apiSource, /return NextResponse\.json\(\{\s*ok: true,\s*myVotes:/);
});

test("prediction viewer scope does not request discarded aggregate vote totals", () => {
  const apiSource = readProjectFile("app/api/prediction/route.ts");
  const viewerBranchStart = apiSource.indexOf('scope === "viewer"');
  const fullPayloadStart = apiSource.indexOf("const players = await playerService.getCachedPlayersList()");

  assert.notEqual(viewerBranchStart, -1);
  assert.notEqual(fullPayloadStart, -1);

  const viewerBranch = apiSource.slice(viewerBranchStart, fullPayloadStart);
  assert.match(viewerBranch, /loadPredictionState\(\{\s*voterId,\s*\}\)/);
  assert.doesNotMatch(
    viewerBranch,
    /includeVoteTotals:\s*true/,
    "Viewer-only refresh should not ask the store to read aggregate vote totals that are not returned"
  );
});

test("admin prediction mutations invalidate the public prediction page", () => {
  const routeSource = readProjectFile("app/api/admin/prediction/route.ts");

  assert.match(routeSource, /import \{ revalidatePath \} from "next\/cache";/);
  assert.match(routeSource, /function revalidatePredictionPublicViews\(\)/);
  assert.match(routeSource, /revalidatePath\("\/prediction"\)/);
  assert.match(routeSource, /await savePredictionMatches\(matches\);[\s\S]*revalidatePredictionPublicViews\(\);/);
  assert.match(routeSource, /await deletePredictionMatch(?:WithVotes)?\(matchId\);[\s\S]*revalidatePredictionPublicViews\(\);/);
});

test("admin prediction hide action persists immediately instead of only changing local state", () => {
  const adminSource = readProjectFile("app/admin/prediction/PredictionMatchAdmin.tsx");

  assert.match(adminSource, /const handleArchive = async \(match: PredictionConfigMatch\) => \{/);
  assert.match(adminSource, /const archivedAt = new Date\(\)\.toISOString\(\);/);
  assert.match(adminSource, /body: JSON\.stringify\(\{ matches: matchesToSave \}\)/);
  assert.match(adminSource, /onClick=\{\(\) => void handleArchive\(match\)\}/);
  assert.doesNotMatch(
    adminSource,
    /onClick=\{\(\) => updateMatchById\(match\.id \|\| "", \{ status: "archived", archived_at: new Date\(\)\.toISOString\(\) \}\)\}/
  );
});
