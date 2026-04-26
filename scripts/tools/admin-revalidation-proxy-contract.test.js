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
