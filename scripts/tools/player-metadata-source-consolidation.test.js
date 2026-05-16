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

test("source consolidation report is read-only and compares canonical candidates", () => {
  const source = readProjectFile("scripts/tools/report-player-metadata-source-consolidation.js");

  assert.match(source, /PROJECTS_DIR/);
  assert.match(source, /LEGACY_METADATA_PATH/);
  assert.match(source, /MASTER_METADATA_PATH/);
  assert.match(source, /player_metadata_source_consolidation_latest\.json/);
  assert.match(source, /safe_soop_id_migration_candidates/);
  assert.match(source, /manual_review_soop_id_candidates/);
  assert.match(source, /legacy_dependency_paths/);
  assert.match(source, /COLLECTION_EXCLUSIONS_PATH/);
  assert.match(source, /excluded_soop_id_candidates/);
  assert.match(source, /scripts\/archive\//);
  assert.match(source, /recommended_source_of_truth/);
  assert.match(source, /legacy_trust_level/);
  assert.match(source, /unverified_reference_only/);
  assert.match(source, /data\/metadata\/projects\/\*\/players\.\*\.v1\.json/);
  assert.doesNotMatch(source, /writeFileSync\([^)]*players\./);
  assert.doesNotMatch(source, /writeFileSync\([^)]*player_metadata\.json/);
});

test("source consolidation report uses identifier matching rather than name-only migration", () => {
  const source = readProjectFile("scripts/tools/report-player-metadata-source-consolidation.js");

  assert.match(source, /gender_wr_id/);
  assert.match(source, /legacy_name_matches_project/);
  assert.match(source, /legacy_soop_id_collision/);
  assert.match(source, /duplicate_gender_wr_id_keys/);
  assert.match(source, /soop_id_collision_risks/);
  assert.doesNotMatch(source, /byName/);
  assert.doesNotMatch(source, /match_key:\s*"name"/);
  assert.doesNotMatch(source, /name_only/);
});

test("package exposes the source consolidation contract test and report", () => {
  const pkg = JSON.parse(readProjectFile("package.json"));

  assert.equal(
    pkg.scripts["test:metadata:source-consolidation"],
    "node scripts/tools/player-metadata-source-consolidation.test.js"
  );
  assert.equal(
    pkg.scripts["report:metadata:source-consolidation"],
    "node scripts/tools/report-player-metadata-source-consolidation.js"
  );
});

test("completed migration helpers are no longer exposed as active npm scripts", () => {
  const pkg = JSON.parse(readProjectFile("package.json"));

  assert.equal(pkg.scripts["report:metadata:project-soop-review"], undefined);
  assert.equal(pkg.scripts["apply:metadata:project-soop-migration"], undefined);
  assert.equal(pkg.scripts["test:metadata:project-soop-migration"], undefined);
  assert.equal(pkg.scripts["test:metadata:project-soop-review"], undefined);
});

test("legacy player metadata is archived outside the active scripts root", () => {
  const source = readProjectFile("scripts/tools/report-player-metadata-source-consolidation.js");

  assert.ok(
    fs.existsSync(
      path.join(
        ROOT,
        "scripts",
        "archive",
        "player-metadata-source-consolidation",
        "player_metadata.legacy_reference.v1.json"
      )
    )
  );
  assert.equal(fs.existsSync(path.join(ROOT, "scripts", "player_metadata.json")), false);
  assert.match(source, /player-metadata-source-consolidation/);
  assert.match(source, /player_metadata\.legacy_reference\.v1\.json/);
  assert.doesNotMatch(source, /scripts", "player_metadata\.json"/);
});
