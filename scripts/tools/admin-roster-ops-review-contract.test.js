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

test("ops review helper exposes grouped approval queue data and decision filtering", () => {
  const source = readProjectFile("lib/admin-roster-ops-review.ts");
  assert.match(source, /export async function buildRosterOpsReview/);
  assert.match(source, /report_source/);
  assert.match(source, /buildRosterChangeItems/);
  assert.match(source, /buildPipelineAlerts/);
  assert.match(source, /pipeline_alerts/);
  assert.match(source, /readRosterReviewDecisions/);
  assert.match(source, /rosterReviewDecisionKey/);
  assert.match(source, /loadMergedRosterAdminState/);
  assert.match(source, /buildAppliedReviewState/);
  assert.match(source, /isAlreadyAppliedReviewItem/);
  assert.match(source, /affiliation_change/);
  assert.match(source, /tier_change/);
  assert.match(source, /race_change/);
  assert.match(source, /excluded_candidate/);
  assert.match(source, /new_candidate/);
  assert.match(source, /team_code/);
  assert.match(source, /tier/);
  assert.match(source, /race/);
  assert.match(source, /exclusions/);
  assert.match(source, /missing_soop_ids/);
  assert.match(source, /zero_record_players/);
  assert.doesNotMatch(source, /writeFileSync|rmSync|saveRemoteRosterAdminCorrection/);
});

test("ops review can read deployed report snapshots before falling back to local tmp reports", () => {
  const source = readProjectFile("lib/admin-roster-ops-review.ts");
  assert.match(source, /OPS_REVIEW_REPORTS_PUBLIC_BASE_URL/);
  assert.match(source, /fetchRemoteReport/);
  assert.match(source, /loadReviewReportDocs/);
  assert.match(source, /remote_public_base/);
  assert.match(source, /local_tmp_reports/);
  assert.match(source, /deriveSiblingPublicBaseUrl/);
});

test("ops review decision store persists operator exclusions", () => {
  const source = readProjectFile("lib/roster-review-decisions.ts");
  assert.match(source, /ROSTER_REVIEW_DECISIONS_PATH/);
  assert.match(source, /roster_review_decisions\.v1\.json/);
  assert.match(source, /saveExcludedRosterReviewDecision/);
  assert.match(source, /decision: "excluded"/);
  assert.match(source, /operator_excluded/);
});

test("zero-record review does not expand a team-level alert to every team member", () => {
  const source = readProjectFile("lib/admin-roster-ops-review.ts");
  assert.match(source, /extractZeroRecordAlertNames/);
  assert.match(source, /namesFromMessage/);
  assert.doesNotMatch(source, /teamPlayers = players\.filter/);
});

test("admin ops review API is admin-only and read-only", () => {
  const source = readProjectFile("app/api/admin/roster/ops-review/route.ts");
  assert.match(source, /buildRosterOpsReview/);
  assert.match(source, /ADMIN_SESSION_COOKIE/);
  assert.match(source, /assertValidAdminSession/);
  assert.match(source, /NextResponse\.json\(\{\s*ok:\s*true/);
  assert.doesNotMatch(source, /POST|PATCH|DELETE/);
});

test("admin ops review decision API saves exclusions through admin session", () => {
  const source = readProjectFile("app/api/admin/roster/ops-review/decisions/route.ts");
  assert.match(source, /POST/);
  assert.match(source, /ADMIN_SESSION_COOKIE/);
  assert.match(source, /assertValidAdminSession/);
  assert.match(source, /isAdminWriteDisabled/);
  assert.match(source, /saveExcludedRosterReviewDecision/);
  assert.match(source, /action !== "exclude"/);
});

test("admin ops review page is an approval inbox, not a raw report", () => {
  const source = readProjectFile("app/admin/roster/ops-review/page.tsx");
  assert.match(source, /승인 대기함/);
  assert.match(source, /대표님 검토 필요/);
  assert.match(source, /소속변동감지/);
  assert.match(source, /티어변동감지/);
  assert.match(source, /신규후보/);
  assert.match(source, /전적 수집: 정상 진행 중/);
  assert.match(source, /기준데이터 반영: 대기 중/);
  assert.match(source, /기준데이터 미반영/);
  assert.match(source, /현재 기준데이터/);
  assert.match(source, /새로 감지된 값/);
  assert.match(source, /\{title\} \{items\.length\}건/);
  assert.match(source, /다음 데이터파이프라인 때 반영됩니다/);
  assert.match(source, /등록/);
  assert.match(source, /반영/);
  assert.match(source, /제외/);
  assert.match(source, /RosterReviewDecisionButtons/);
  assert.match(source, /excludedCandidateItems/);
  assert.match(source, /groups\.pipeline_alerts/);
  assert.match(source, /AlertRows/);
  assert.match(source, /운영 알림/);
  assert.match(source, /report_source/);
  assert.match(source, /decisionTotal = affiliationItems\.length \+ tierItems\.length \+ newCandidateItems\.length \+ excludedCandidateItems\.length/);
  assert.doesNotMatch(source, /무시/);
  assert.doesNotMatch(source, /보류/);
  assert.doesNotMatch(source, /등록 검토|반영 검토/);
  assert.doesNotMatch(source, /JSON\.stringify|<pre|JsonList|운영 점검 리포트/);
  assert.doesNotMatch(source, /Roster Ops Review|Decision queue|Data quality checks|Recovery reference|Open roster editor/);
  assert.doesNotMatch(source, /fetch\(/);
});

test("ops pipeline publishes latest review reports for deployed admin review", () => {
  const pkg = JSON.parse(readProjectFile("package.json"));
  assert.equal(
    pkg.scripts["sync:ops-review-reports"],
    "node scripts/tools/sync-ops-review-reports.js"
  );

  const script = readProjectFile("scripts/tools/sync-ops-review-reports.js");
  assert.match(script, /daily_pipeline_alerts_latest\.json/);
  assert.match(script, /roster_change_review_latest\.json/);
  assert.match(script, /ops_review_reports_manifest\.json/);
  assert.match(script, /OPS_REVIEW_REPORTS_R2_PREFIX/);
  assert.match(script, /PLAYER_HISTORY_PUBLIC_BASE_URL/);
  assert.doesNotMatch(script, /env\.R2_PUBLIC_BASE_URL/);

  const workflow = readProjectFile(".github/workflows/ops-pipeline-cache.yml");
  assert.match(workflow, /Sync ops review reports/);
  assert.match(workflow, /npm run sync:ops-review-reports -- --upload-r2-if-configured/);
});

test("admin ops review exclusion button posts operator decision", () => {
  const source = readProjectFile("components/admin/roster/RosterReviewDecisionButtons.tsx");
  assert.match(source, /fetch\("\/api\/admin\/roster\/ops-review\/decisions"/);
  assert.match(source, /action: "exclude"/);
  assert.match(source, /router\.refresh/);
  assert.match(source, /제외/);
});

test("admin ops review page keeps secondary quality checks below the approval inbox", () => {
  const source = readProjectFile("app/admin/roster/ops-review/page.tsx");
  assert.match(source, /추가 점검/);
  assert.match(source, /SOOP ID 누락/);
  assert.match(source, /전적 0건 선수/);
  assert.match(source, /수집 제외 선수/);
  assert.match(source, /PlayerList/);
});

test("package exposes the ops review contract test", () => {
  const pkg = JSON.parse(readProjectFile("package.json"));
  assert.equal(
    pkg.scripts["test:admin-roster-ops-review"],
    "node scripts/tools/admin-roster-ops-review-contract.test.js"
  );
});

test("admin ops review player rows use duplicate-safe render keys", () => {
  const source = readProjectFile("app/admin/roster/ops-review/page.tsx");
  assert.match(source, /playerRowKey/);
  assert.match(source, /item\.entity_id/);
  assert.match(source, /index/);
  assert.doesNotMatch(source, /key=\{item\.entity_id \|\| `\$\{item\.name\}-\$\{index\}`\}/);
});
