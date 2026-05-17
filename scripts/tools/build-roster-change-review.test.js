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
  assert.equal(review.items.length, 5);
  assert.equal(review.items[0].review_kind, "affiliation_change");
  assert.equal(review.items[0].operator_status, "pending");
  assert.match(review.items[0].match_collection_note, /continues independently/);
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

runTest("roster change review separates approval queue item kinds", () => {
  const review = buildReview({
    generated_at: "2026-05-15T00:00:00.000Z",
    report_only: true,
    moved: [{ entity_id: "eloboard:female:1", name: "A", from: "yb", to: "fa" }],
    tier_changed: [{ entity_id: "eloboard:female:2", name: "B", from: "7", to: "6" }],
    race_changed: [],
    added: [{ entity_id: "eloboard:female:3", name: "C", to: "fa" }],
    observed_conflicts: [],
    guarded_teams: [],
  });

  assert.deepEqual(
    review.items.map((item) => item.review_kind),
    ["affiliation_change", "tier_change", "new_candidate"]
  );
  assert.deepEqual(
    review.items.map((item) => item.decision_url),
    [
      "/admin/roster?review=affiliation_change&entity_id=eloboard%3Afemale%3A1&team_code=fa",
      "/admin/roster?review=tier_change&entity_id=eloboard%3Afemale%3A2&tier=6",
      "/admin/roster?review=new_candidate&entity_id=eloboard%3Afemale%3A3&team_code=fa",
    ]
  );
});

runTest("roster change review suppresses operator-excluded repeated candidates", () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "roster-review-decisions-"));
  const decisionsPath = path.join(dir, "roster_review_decisions.v1.json");
  fs.writeFileSync(
    decisionsPath,
    JSON.stringify(
      {
        schema_version: "1.0.0",
        decisions: [
          {
            entity_id: "eloboard:female:3",
            name: "C",
            review_kind: "new_candidate",
            decision: "excluded",
            observed_to: "fa",
            decided_at: "2026-05-15T00:00:00.000Z",
          },
          {
            entity_id: "eloboard:female:1",
            name: "A",
            review_kind: "affiliation_change",
            decision: "excluded",
            observed_from: "yb",
            observed_to: "fa",
            decided_at: "2026-05-15T00:00:00.000Z",
          },
        ],
      },
      null,
      2
    ),
    "utf8"
  );

  const review = buildReview(
    {
      generated_at: "2026-05-15T00:00:00.000Z",
      report_only: true,
      moved: [{ entity_id: "eloboard:female:1", name: "A", from: "yb", to: "fa" }],
      tier_changed: [{ entity_id: "eloboard:female:2", name: "B", from: "7", to: "6" }],
      race_changed: [],
      added: [{ entity_id: "eloboard:female:3", name: "C", to: "fa" }],
      observed_conflicts: [],
      guarded_teams: [],
    },
    { decisionsPath }
  );

  assert.equal(review.summary.total_review_items, 1);
  assert.deepEqual(review.items.map((item) => item.review_kind), ["tier_change"]);
  assert.equal(review.summary.excluded_by_operator, 2);
});
