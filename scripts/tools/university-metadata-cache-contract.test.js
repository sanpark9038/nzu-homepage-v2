const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");

const repoRoot = path.resolve(__dirname, "..", "..");

function readProjectFile(filePath) {
  return fs.readFileSync(path.join(repoRoot, filePath), "utf8");
}

test("university metadata reads use an mtime cache guard", () => {
  const source = readProjectFile("lib/university-metadata.ts");

  assert.match(
    source,
    /let\s+cachedUniversityMetadata/,
    "University metadata should keep a module-scoped cache for warm server instances"
  );
  assert.match(
    source,
    /fs\.statSync\(UNIVERSITIES_PATH\)/,
    "University metadata should check file mtime before reading JSON"
  );
  assert.match(
    source,
    /mtimeMs/,
    "University metadata cache keys should include file mtime"
  );
  assert.match(
    source,
    /cachedUniversityMetadata\.mtimeMs\s*===\s*mtimeMs/,
    "Unchanged metadata should return the cached document"
  );
  assert.match(
    source,
    /cachedUniversityMetadata\s*=\s*\{[\s\S]*doc[\s\S]*mtimeMs/s,
    "Fresh metadata reads and writes should update the module cache"
  );
});

