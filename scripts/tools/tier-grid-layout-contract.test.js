const assert = require("assert");
const fs = require("fs");
const path = require("path");

const ROOT = path.resolve(__dirname, "..", "..");

function readProjectFile(relativePath) {
  return fs.readFileSync(path.join(ROOT, relativePath), "utf8");
}

function test(name, fn) {
  try {
    fn();
    console.log(`ok - ${name}`);
  } catch (error) {
    console.error(`not ok - ${name}`);
    console.error(error);
    process.exitCode = 1;
  }
}

test("tier card grids share one ideal layout across default, team, and loading states", () => {
  const layoutSource = readProjectFile("components/players/tier-grid-layout.ts");
  const tierGroupSource = readProjectFile("components/players/TierGroup.tsx");
  const teamGridSource = readProjectFile("components/players/TeamTierCompactGrid.tsx");
  const clientViewSource = readProjectFile("app/tier/TierClientView.tsx");

  assert.match(layoutSource, /export const TIER_PLAYER_GRID_CLASS/);
  assert.match(layoutSource, /2xl:grid-cols-7/);
  assert.doesNotMatch(layoutSource, /2xl:grid-cols-6/);

  assert.match(tierGroupSource, /TIER_PLAYER_GRID_CLASS/);
  assert.match(teamGridSource, /TIER_PLAYER_GRID_CLASS/);
  assert.match(clientViewSource, /TIER_PLAYER_GRID_CLASS/);

  assert.doesNotMatch(tierGroupSource, /grid-cols-1 justify-items-center gap-2 sm:grid-cols-2 lg:grid-cols-4 xl:grid-cols-5 2xl:grid-cols-7/);
  assert.doesNotMatch(teamGridSource, /md:grid-cols-3/);
  assert.doesNotMatch(teamGridSource, /2xl:grid-cols-6/);
  assert.doesNotMatch(teamGridSource, /className="max-w-56"/);
});
