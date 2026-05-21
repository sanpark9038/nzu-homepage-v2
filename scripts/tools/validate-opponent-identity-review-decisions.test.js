const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");

const {
  buildDecisionTemplateFromQueue,
  validateDecisionDocument,
  writeDecisionTemplate,
} = require("./validate-opponent-identity-review-decisions");

function runTest(name, fn) {
  try {
    fn();
    console.log(`PASS ${name}`);
  } catch (error) {
    console.error(`FAIL ${name}`);
    throw error;
  }
}

function withFixtureDir(fn) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "nzu-opponent-review-decisions-"));
  try {
    fn(dir);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
}

runTest("buildDecisionTemplateFromQueue records queue source without creating undecided rows", () => {
  const template = buildDecisionTemplateFromQueue(
    {
      total_names: 2,
      total_rows: 150,
      items: [
        {
          rank: 1,
          opponent_name: "high",
          match_rows: 120,
          latest_match_date: "2026-05-01",
          recommended_action: "external_or_metadata_review_needed",
          decision_prompt: "classify_as_canonical_or_external",
        },
        {
          rank: 2,
          opponent_name: "medium",
          match_rows: 30,
          latest_match_date: "2026-04-01",
          recommended_action: "external_candidate",
          decision_prompt: "mark_external_or_leave_unrecorded",
        },
      ],
    },
    {
      generatedAt: "2026-05-21T00:00:00.000Z",
      sourceReviewQueue: "tmp/reports/queue.json",
    }
  );

  assert.equal(template.schema_version, "1.0.0");
  assert.equal(template.source_review_queue, "tmp/reports/queue.json");
  assert.deepEqual(template.allowed_decisions, ["canonical_candidate", "external_opponent"]);
  assert.equal(template.decisions.length, 0);
  assert.deepEqual(template.totals, {
    queue_names: 2,
    queue_rows: 150,
    decisions: 0,
    canonical_candidate: 0,
    external_opponent: 0,
  });
});

runTest("validateDecisionDocument accepts reviewed canonical and external decisions", () => {
  const result = validateDecisionDocument({
    schema_version: "1.0.0",
    decisions: [
      {
        opponent_name: "candidate",
        decision: "canonical_candidate",
        canonical_name: "Candidate",
        notes: "add to project metadata after operator approval",
      },
      {
        opponent_name: "external",
        decision: "external_opponent",
      },
    ],
  });

  assert.deepEqual(result.errors, []);
  assert.deepEqual(result.totals, {
    decisions: 2,
    canonical_candidate: 1,
    external_opponent: 1,
  });
});

runTest("validateDecisionDocument rejects duplicates, defer, and incomplete canonical candidates", () => {
  const result = validateDecisionDocument({
    schema_version: "1.0.0",
    decisions: [
      {
        opponent_name: "candidate",
        decision: "canonical_candidate",
      },
      {
        opponent_name: "candidate",
        decision: "external_opponent",
      },
      {
        opponent_name: "bad",
        decision: "defer",
      },
    ],
  });

  assert.match(result.errors.join("\n"), /canonical_name or target_entity_id/);
  assert.match(result.errors.join("\n"), /duplicate opponent_name/);
  assert.match(result.errors.join("\n"), /invalid decision: defer/);
});

runTest("writeDecisionTemplate writes a queue-derived decision file", () => {
  withFixtureDir((dir) => {
    const queuePath = path.join(dir, "queue.json");
    const outputPath = path.join(dir, "decisions.json");
    fs.writeFileSync(
      queuePath,
      JSON.stringify({
        total_names: 1,
        total_rows: 10,
        items: [
          {
            rank: 1,
            opponent_name: "review-me",
            match_rows: 10,
            latest_match_date: "2026-05-01",
            recommended_action: "external_candidate",
            decision_prompt: "mark_external_or_leave_unrecorded",
          },
        ],
      }),
      "utf8"
    );

    const written = writeDecisionTemplate({ queuePath, outputPath, generatedAt: "2026-05-21T00:00:00.000Z" });
    assert.equal(written.outputPath, outputPath);

    const doc = JSON.parse(fs.readFileSync(outputPath, "utf8"));
    assert.equal(doc.decisions.length, 0);
    assert.equal(doc.totals.queue_names, 1);
  });
});
