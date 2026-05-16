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

test("project SOOP ID migration is guarded by explicit write flag", () => {
  const source = readProjectFile("scripts/tools/apply-project-soop-id-migration.js");

  assert.match(source, /--write/);
  assert.match(source, /--project/);
  assert.match(source, /project_filter/);
  assert.match(source, /safe_soop_id_migration_candidates/);
  assert.match(source, /player_metadata_source_consolidation_latest\.json/);
  assert.match(source, /players\.\$\{project\}\.v1\.json/);
  assert.match(source, /gender_wr_id/);
  assert.match(source, /soop_user_id/);
  assert.match(source, /project_soop_id_migration_report\.json/);
  assert.match(source, /Dry-run only/);
});

test("project SOOP ID migration can limit writes to one project", () => {
  const source = readProjectFile("scripts/tools/apply-project-soop-id-migration.js");

  assert.match(source, /parseArgs/);
  assert.match(source, /projectFilter/);
  assert.match(source, /candidate\.project === projectFilter/);
});

test("project SOOP ID migration does not use name-only matching", () => {
  const source = readProjectFile("scripts/tools/apply-project-soop-id-migration.js");

  assert.doesNotMatch(source, /byName/);
  assert.doesNotMatch(source, /match_key:\s*"name"/);
  assert.doesNotMatch(source, /name_only/);
});

test("package exposes the project SOOP ID migration test and script", () => {
  const pkg = JSON.parse(readProjectFile("package.json"));

  assert.equal(
    pkg.scripts["test:metadata:project-soop-migration"],
    "node scripts/tools/apply-project-soop-id-migration.test.js"
  );
  assert.equal(
    pkg.scripts["apply:metadata:project-soop-migration"],
    "node scripts/tools/apply-project-soop-id-migration.js"
  );
});
