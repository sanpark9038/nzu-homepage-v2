const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");

const {
  buildReview,
  writeReview,
} = require("./build-roster-change-review");

function runTest(name, fn) {
  try {
    fn();
    console.log(`PASS ${name}`);
  } catch (error) {
    console.error(`FAIL ${name}`);
    throw error;
  }
}

runTest("roster change review keeps only operator-facing suspects", () => {
  const review = buildReview({
    generated_at: "2026-05-15T00:00:00.000Z",
    report_only: true,
    moved: [
      { entity_id: "eloboard:female:1", name: "A", from: "jsa", to: "hm", change_confidence: "confirmed" },
    ],
    tier_changed: [
      { entity_id: "eloboard:female:2", name: "B", from: "7", to: "6" },
    ],
    race_changed: [
      { entity_id: "eloboard:female:3", name: "C", from: "Zerg", to: "Terran" },
    ],
    added: [
      { entity_id: "eloboard:female:4", name: "D", to: "fa", change_confidence: "confirmed" },
    ],
    observed_conflicts: [
      { entity_id: "eloboard:female:5", name_prev: "E", team_prev: "c9", team_next: "yb" },
    ],
    guarded_teams: [
      { team_code: "bgm", reason: "fetch_error", detail: "timeout" },
    ],
  });

  assert.equal(review.summary.total_review_items, 5);
  assert.equal(review.summary.guarded_teams, 1);
  assert.equal(review.operator_flow.edit_page, "/admin/roster");
  assert.equal(review.operator_flow.publish_rule, "approved sync only");
});

runTest("roster change review writes json and markdown", () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "roster-review-"));
  const result = writeReview(
    buildReview({
      generated_at: "2026-05-15T00:00:00.000Z",
      moved: [{ entity_id: "eloboard:female:1", name: "A", from: "jsa", to: "hm" }],
      tier_changed: [],
      race_changed: [],
      added: [],
      observed_conflicts: [],
      guarded_teams: [],
    }),
    { reportsDir: dir }
  );

  assert.equal(fs.existsSync(result.jsonPath), true);
  assert.equal(fs.existsSync(result.mdPath), true);
  const md = fs.readFileSync(result.mdPath, "utf8");
  assert.match(md, /Roster Change Review/);
  assert.match(md, /\/admin\/roster/);
});
