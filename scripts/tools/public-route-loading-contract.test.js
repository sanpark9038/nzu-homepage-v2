const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");

const repoRoot = path.resolve(__dirname, "..", "..");

function readProjectFile(relativePath) {
  return fs.readFileSync(path.join(repoRoot, relativePath), "utf8");
}

function existsProjectFile(relativePath) {
  return fs.existsSync(path.join(repoRoot, relativePath));
}

test("public data routes expose route-level loading boundaries", () => {
  // player uses a route-specific skeleton since d9b96cb; the rest share PublicRouteLoading.
  const routes = ["board", "player", "schedule", "prediction", "tier"];
  const sharedLoadingRoutes = new Set(["board", "schedule", "prediction", "tier"]);

  for (const route of routes) {
    const loadingPath = `app/${route}/loading.tsx`;
    assert.ok(existsProjectFile(loadingPath), `${loadingPath} should exist`);

    const source = readProjectFile(loadingPath);
    if (sharedLoadingRoutes.has(route)) {
      assert.match(source, /PublicRouteLoading/);
    }
    assert.doesNotMatch(source, /"use client"|\'use client\'/);
  }

  assert.equal(existsProjectFile("app/teams/loading.tsx"), false);
});

test("public route loading UI stays shared, skeletal, and copy-neutral", () => {
  const source = readProjectFile("components/PublicRouteLoading.tsx");

  assert.match(source, /import \{ Skeleton \}/);
  assert.match(source, /aria-label="Loading"/);
  assert.doesNotMatch(source, />[^<{]*[가-힣][^<{]*</);
});
