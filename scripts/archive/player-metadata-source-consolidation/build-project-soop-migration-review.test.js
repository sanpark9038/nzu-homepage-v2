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

test("project SOOP migration review builder creates operator review artifacts", () => {
  const source = readProjectFile("scripts/tools/build-project-soop-migration-review.js");

  assert.match(source, /--project/);
  assert.match(source, /project_soop_migration_review/);
  assert.match(source, /safe_soop_id_migration_candidates/);
  assert.match(source, /https:\/\/ch\.sooplive\.co\.kr\//);
  assert.match(source, /확인 상태/);
  assert.match(source, /성별\+wr_id 일치/);
  assert.match(source, /이름 일치/);
  assert.doesNotMatch(source, /writeFileSync\([^)]*players\./);
  assert.doesNotMatch(source, /writeFileSync\([^)]*player_metadata\.json/);
});

test("package exposes the project SOOP migration review script and test", () => {
  const pkg = JSON.parse(readProjectFile("package.json"));

  assert.equal(
    pkg.scripts["report:metadata:project-soop-review"],
    "node scripts/tools/build-project-soop-migration-review.js"
  );
  assert.equal(
    pkg.scripts["test:metadata:project-soop-review"],
    "node scripts/tools/build-project-soop-migration-review.test.js"
  );
});
