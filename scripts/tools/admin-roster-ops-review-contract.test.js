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
  assert.match(source, /data", "metadata", "projects"/);
  assert.match(source, /missing_soop_ids/);
  assert.match(source, /zero_record_players/);
  assert.match(source, /roster_change_review/);
  assert.match(source, /excluded_players/);
  assert.match(source, /new_player_candidates/);
  assert.doesNotMatch(source, /scripts[/\\]", "player_metadata\.json"|player_metadata\.json|players\.master\.v1\.json/);
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
  assert.doesNotMatch(source, /fetch\(/);
});

test("package exposes the ops review contract test", () => {
  const pkg = JSON.parse(readProjectFile("package.json"));
  assert.equal(
    pkg.scripts["test:admin-roster-ops-review"],
    "node scripts/tools/admin-roster-ops-review-contract.test.js"
  );
});

test("admin ops review page exposes operator information architecture", () => {
  const source = readProjectFile("app/admin/roster/ops-review/page.tsx");
  assert.match(source, /decision_queue/);
  assert.match(source, /data_quality/);
  assert.match(source, /reference/);
  assert.match(source, /ReviewQueueSection/);
  assert.match(source, /nextAction/);
  assert.match(source, /로스터 편집 열기/);
});

test("admin ops review page uses Korean operator-facing labels", () => {
  const source = readProjectFile("app/admin/roster/ops-review/page.tsx");
  const nav = readProjectFile("components/admin/AdminNav.tsx");
  assert.match(source, /로스터 운영 점검/);
  assert.match(source, /판단 대기/);
  assert.match(source, /데이터 품질 점검/);
  assert.match(source, /복구 참고/);
  assert.match(source, /로스터 편집 열기/);
  assert.match(source, /SOOP ID 누락/);
  assert.match(source, /전적 0건 선수/);
  assert.match(source, /로스터 변경 검토/);
  assert.match(source, /수집 제외 선수/);
  assert.match(source, /신규 선수 후보/);
  assert.match(nav, /로스터 점검/);
  assert.doesNotMatch(source, /Roster Ops Review|Decision queue|Data quality checks|Recovery reference|Open roster editor|Missing SOOP IDs|Zero-record players|Roster change review|Excluded players|New player candidates/);
  assert.doesNotMatch(nav, /Roster Review/);
});

test("admin ops review summary cards use Korean group titles", () => {
  const source = readProjectFile("app/admin/roster/ops-review/page.tsx");
  assert.match(source, /SUMMARY_GROUP_KEYS/);
  assert.match(source, /GROUP_META\[key\]\.title/);
  assert.doesNotMatch(source, /Object\.values\(groups\)\.map/);
});

test("admin ops review player rows use duplicate-safe render keys", () => {
  const source = readProjectFile("app/admin/roster/ops-review/page.tsx");
  assert.match(source, /playerRowKey/);
  assert.match(source, /item\.entity_id/);
  assert.match(source, /index/);
  assert.doesNotMatch(source, /key=\{item\.entity_id \|\| `\$\{item\.name\}-\$\{index\}`\}/);
});
