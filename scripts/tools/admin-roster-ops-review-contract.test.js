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

test("ops review helper exposes read-only grouped review data", () => {
  const source = readProjectFile("lib/admin-roster-ops-review.ts");
  assert.match(source, /export async function buildRosterOpsReview/);
  assert.match(source, /missing_soop_ids/);
  assert.match(source, /zero_record_players/);
  assert.match(source, /roster_change_review/);
  assert.match(source, /excluded_players/);
  assert.match(source, /new_player_candidates/);
  assert.doesNotMatch(source, /writeFileSync|rmSync|saveRemoteRosterAdminCorrection/);
});

test("admin ops review API returns buildRosterOpsReview result", () => {
  const source = readProjectFile("app/api/admin/roster/ops-review/route.ts");
  assert.match(source, /buildRosterOpsReview/);
  assert.match(source, /NextResponse\.json\(\{\s*ok:\s*true/);
  assert.doesNotMatch(source, /POST|PATCH|DELETE/);
});

test("admin ops review page renders review groups without mutation controls", () => {
  const source = readProjectFile("app/admin/roster/ops-review/page.tsx");
  assert.match(source, /missing_soop_ids/);
  assert.match(source, /zero_record_players/);
  assert.match(source, /roster_change_review/);
  assert.match(source, /excluded_players/);
  assert.match(source, /new_player_candidates/);
  assert.doesNotMatch(source, /승인|제외|fetch\(/);
});

test("package exposes the ops review contract test", () => {
  const pkg = JSON.parse(readProjectFile("package.json"));
  assert.equal(
    pkg.scripts["test:admin-roster-ops-review"],
    "node scripts/tools/admin-roster-ops-review-contract.test.js"
  );
});
