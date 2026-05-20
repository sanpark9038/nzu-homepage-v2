const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");

const repoRoot = path.resolve(__dirname, "..", "..");

function readProjectFile(filePath) {
  return fs.readFileSync(path.join(repoRoot, filePath), "utf8");
}

test("SOOP auth fetches use an explicit abort timeout", () => {
  const source = readProjectFile("lib/soop-auth.ts");

  assert.match(source, /SOOP_AUTH_FETCH_TIMEOUT_MS\s*=\s*(5|6|7|8|9|10)_000/);
  assert.match(source, /AbortController/);
  assert.match(source, /setTimeout\(\(\)\s*=>\s*controller\.abort\(\)/);
  assert.match(source, /clearTimeout\(timeout/);
  assert.match(source, /signal:\s*controller\.signal/);
  assert.match(source, /fetchSoopApi\(SOOP_TOKEN_URL/);
  assert.match(source, /fetchSoopApi\(SOOP_USERINFO_URL/);
});
