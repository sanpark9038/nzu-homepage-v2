const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");

const {
  buildCoverageReport,
  classifyOpponentName,
  formatMarkdown,
  groupTopUnresolvedByAction,
  normalizeIdentityLookupName,
  recommendUnresolvedOpponent,
  summarizeRecommendedActions,
  summarizeUnresolvedOpponents,
} = require("./report-player-history-opponent-identity-coverage");

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
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "nzu-opponent-identity-coverage-"));
  try {
    fn(dir);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
}

function writeArtifact(dir, fileName, matchHistory) {
  fs.writeFileSync(
    path.join(dir, fileName),
    JSON.stringify(
      {
        generated_at: "2026-05-16T00:00:00.000Z",
        player: {
          entity_id: `eloboard:test:${fileName.replace(".json", "")}`,
          name: fileName.replace(".json", ""),
        },
        match_history: matchHistory,
      },
      null,
      2
    ),
    "utf8"
  );
}

function withProjectDir(fn) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "nzu-opponent-identity-projects-"));
  try {
    fs.mkdirSync(path.join(dir, "nzu"), { recursive: true });
    fs.writeFileSync(
      path.join(dir, "nzu", "players.nzu.v1.json"),
      JSON.stringify(
        {
          roster: [
            { entity_id: "eloboard:female:1", name: "opponent-a", team_code: "nzu" },
            { entity_id: "eloboard:female:2", name: "shared", team_code: "nzu" },
            { entity_id: "eloboard:male:3", name: "shared", team_code: "nzu" },
            { entity_id: "eloboard:female:4", name: "canonical", display_name: "display name", team_code: "nzu" },
          ],
        },
        null,
        2
      ),
      "utf8"
    );
    fn(dir);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
}

runTest("buildCoverageReport measures opponent entity id and name coverage", () => {
  withFixtureDir((dir) => {
    writeArtifact(dir, "player-a.json", [
      { opponent_entity_id: "eloboard:female:1", opponent_name: "opponent-a" },
      { opponent_entity_id: "", opponent_name: "opponent-b", opponent_race: "Z", match_date: "2026-05-01" },
    ]);
    writeArtifact(dir, "player-b.json", [
      { opponentEntityId: "eloboard:male:2", opponentName: "opponent-c" },
    ]);
    fs.writeFileSync(path.join(dir, "index.json"), "{}", "utf8");

    withProjectDir((projectsDir) => {
      const report = buildCoverageReport({
        artifactDir: dir,
        projectsDir,
        generatedAt: "2026-05-16T00:00:00.000Z",
      });

      assert.equal(report.artifact_files, 2);
      assert.equal(report.players_with_history, 2);
      assert.equal(report.match_rows, 3);
      assert.equal(report.rows_with_opponent_entity_id, 2);
      assert.equal(report.rows_with_opponent_name, 3);
      assert.equal(report.opponent_entity_id_coverage_pct, 66.67);
      assert.equal(report.opponent_name_coverage_pct, 100);
      assert.equal(report.ready_to_remove_name_fallback, false);
      assert.equal(report.incomplete_samples.length, 1);
      assert.equal(report.unresolved_opponents.missing_rows, 1);
      assert.equal(report.unresolved_opponents.unique_names, 1);
      assert.equal(report.unresolved_opponents.no_candidate_names, 1);
      assert.equal(report.unresolved_opponents.top[0].latest_match_date, "2026-05-01");
      assert.deepEqual(report.unresolved_opponents.top[0].opponent_race_counts, { Z: 1 });
      assert.equal(report.unresolved_opponents.top[0].recommended_action, "ignore_low_frequency");
      assert.deepEqual(report.unresolved_opponents.recommended_action_counts, { ignore_low_frequency: 1 });
      assert.equal(report.unresolved_opponents.by_recommended_action.ignore_low_frequency.length, 1);
    });
  });
});

runTest("buildCoverageReport marks fallback removal ready only when every row has opponent identity", () => {
  withFixtureDir((dir) => {
    writeArtifact(dir, "player-a.json", [
      { opponent_entity_id: "eloboard:female:1", opponent_name: "opponent-a" },
      { opponent_entity_id: "eloboard:female:2", opponent_name: "opponent-b" },
    ]);

    const report = buildCoverageReport({
      artifactDir: dir,
      generatedAt: "2026-05-16T00:00:00.000Z",
    });

    assert.equal(report.opponent_entity_id_coverage_pct, 100);
    assert.equal(report.ready_to_remove_name_fallback, true);
    assert.equal(report.incomplete_samples.length, 0);
  });
});

runTest("formatMarkdown includes the fallback removal decision", () => {
  const markdown = formatMarkdown({
    generated_at: "2026-05-16T00:00:00.000Z",
    artifact_dir: "tmp/player-history-artifacts",
    artifact_files: 1,
    players_with_history: 1,
    match_rows: 1,
    rows_with_opponent_entity_id: 0,
    rows_with_opponent_name: 1,
    opponent_entity_id_coverage_pct: 0,
    opponent_name_coverage_pct: 100,
    ready_to_remove_name_fallback: false,
    incomplete_samples: [],
    unresolved_opponents: {
      missing_rows: 1,
      unique_names: 1,
      no_candidate_names: 1,
      ambiguous_candidate_names: 0,
      unique_candidate_names: 0,
      recommended_action_counts: { ignore_low_frequency: 1 },
      by_recommended_action: {
        ignore_low_frequency: [
          {
            opponent_name: "unknown",
            match_rows: 1,
            latest_match_date: "2026-05-01",
            candidate_status: "no_candidate",
            candidate_count: 0,
            recommended_action: "ignore_low_frequency",
          },
        ],
      },
      top: [
        {
          opponent_name: "unknown",
          match_rows: 1,
          latest_match_date: "2026-05-01",
          candidate_status: "no_candidate",
          candidate_count: 0,
          recommended_action: "ignore_low_frequency",
        },
      ],
    },
  });

  assert.match(markdown, /ready_to_remove_name_fallback: false/);
  assert.match(markdown, /opponent_entity_id_coverage_pct: 0/);
  assert.match(markdown, /Top Unresolved Opponents/);
  assert.match(markdown, /Review Groups/);
  assert.match(markdown, /ignore_low_frequency/);
});

runTest("classifyOpponentName separates unique, ambiguous, and missing candidates", () => {
  const candidateIndex = new Map([
    ["opponenta", new Map([["eloboard:female:1", { entity_id: "eloboard:female:1" }]])],
    [
      "shared",
      new Map([
        ["eloboard:female:2", { entity_id: "eloboard:female:2" }],
        ["eloboard:male:3", { entity_id: "eloboard:male:3" }],
      ]),
    ],
  ]);

  assert.equal(normalizeIdentityLookupName(" Opponent A "), "opponenta");
  assert.equal(classifyOpponentName("Opponent A", candidateIndex).status, "unique_candidate");
  assert.equal(classifyOpponentName("shared", candidateIndex).status, "ambiguous_candidate");
  assert.equal(classifyOpponentName("missing", candidateIndex).status, "no_candidate");
});

runTest("summarizeUnresolvedOpponents ranks unresolved names by match rows", () => {
  const unresolvedByName = new Map([
    [
      "b",
      {
        opponent_name: "b",
        lookup_name: "b",
        match_rows: 2,
        latest_match_date: "2026-04-01",
        opponent_race_counts: new Map([["Z", 2]]),
        player_samples: [],
      },
    ],
    [
      "a",
      {
        opponent_name: "a",
        lookup_name: "a",
        match_rows: 105,
        latest_match_date: "2026-05-01",
        opponent_race_counts: new Map([["T", 100], ["P", 5]]),
        player_samples: [],
      },
    ],
  ]);
  const candidateIndex = new Map([
    ["a", new Map([["eloboard:female:1", { entity_id: "eloboard:female:1" }]])],
  ]);

  const summary = summarizeUnresolvedOpponents(unresolvedByName, candidateIndex, 1);

  assert.equal(summary.missing_rows, 107);
  assert.equal(summary.unique_names, 2);
  assert.equal(summary.unique_candidate_names, 1);
  assert.equal(summary.no_candidate_names, 1);
  assert.deepEqual(summary.top.map((row) => row.opponent_name), ["a"]);
  assert.equal(summary.top[0].latest_match_date, "2026-05-01");
  assert.deepEqual(summary.top[0].opponent_race_counts, { T: 100, P: 5 });
  assert.equal(summary.top[0].recommended_action, "metadata_review_needed");
  assert.deepEqual(summary.recommended_action_counts, {
    ignore_low_frequency: 1,
    metadata_review_needed: 1,
  });
  assert.equal(summary.by_recommended_action.metadata_review_needed[0].opponent_name, "a");
});

runTest("recommendUnresolvedOpponent keeps low-count missing names out of metadata by default", () => {
  assert.equal(
    recommendUnresolvedOpponent({ match_rows: 200 }, "no_candidate"),
    "external_or_metadata_review_needed"
  );
  assert.equal(recommendUnresolvedOpponent({ match_rows: 25 }, "no_candidate"), "external_candidate");
  assert.equal(recommendUnresolvedOpponent({ match_rows: 2 }, "no_candidate"), "ignore_low_frequency");
  assert.equal(recommendUnresolvedOpponent({ match_rows: 1 }, "ambiguous_candidate"), "manual_disambiguation_needed");
});

runTest("recommended action helpers summarize and group review rows without creating registry data", () => {
  const rows = [
    { opponent_name: "a", recommended_action: "external_candidate" },
    { opponent_name: "b", recommended_action: "external_candidate" },
    { opponent_name: "c", recommended_action: "ignore_low_frequency" },
  ];

  assert.deepEqual(summarizeRecommendedActions(rows), {
    external_candidate: 2,
    ignore_low_frequency: 1,
  });
  assert.deepEqual(Object.keys(groupTopUnresolvedByAction(rows, 1)).sort(), [
    "external_candidate",
    "ignore_low_frequency",
  ]);
  assert.deepEqual(groupTopUnresolvedByAction(rows, 1).external_candidate.map((row) => row.opponent_name), ["a"]);
});
