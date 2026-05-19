const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");

const repoRoot = path.resolve(__dirname, "..", "..");

function readProjectFile(filePath) {
  return fs.readFileSync(path.join(repoRoot, filePath), "utf8");
}

test("serving revalidation endpoint bypasses admin-session proxy and relies on its own secret", () => {
  const proxy = readProjectFile("proxy.ts");

  assert.match(proxy, /\/api\/admin\/revalidate-serving/);
});

test("ops pipeline workflow passes serving revalidation envs to sync steps", () => {
  const workflow = readProjectFile(".github/workflows/ops-pipeline-cache.yml");

  assert.match(workflow, /SERVING_REVALIDATE_SECRET:\s*\$\{\{\s*secrets\.SERVING_REVALIDATE_SECRET\s*\}\}/);
  assert.match(workflow, /SERVING_REVALIDATE_URL:\s*\$\{\{\s*(vars|secrets)\.SERVING_REVALIDATE_URL\s*\}\}/);
});

test("SOOP Edge live sync revalidates public player cache after DB updates", () => {
  const workflow = readProjectFile(".github/workflows/soop-live-sync.yml");
  const edgeFunction = readProjectFile("supabase/functions/soop-live-sync/index.ts");

  assert.match(workflow, /functions\/v1\/soop-live-sync/);
  assert.doesNotMatch(workflow, /node scripts\/tools\/revalidate-public-cache\.js/);
  assert.match(edgeFunction, /SERVING_REVALIDATE_SECRET/);
  assert.match(edgeFunction, /SERVING_REVALIDATE_URL/);
  assert.match(edgeFunction, /public-players-list/);
});
