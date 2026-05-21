const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");

const {
  buildCoverageReport,
  buildOperatorReviewQueue,
  classifyOpponentName,
  formatMarkdown,
  groupTopUnresolvedByAction,
  loadOpponentIdentityAliases,
  loadOpponentReviewDecisions,
  normalizeIdentityLookupName,
  recommendUnresolvedOpponent,
  summarizeRecommendedActions,
  summarizeUnresolvedOpponents,
  writeReport,
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

function writeAliasFile(filePath, aliases) {
  fs.writeFileSync(
    filePath,
    JSON.stringify(
      {
        schema_version: "1.0.0",
        updated_at: "2026-05-21T00:00:00.000+09:00",
        aliases,
      },
      null,
      2
    ),
    "utf8"
  );
}

function writeDecisionFile(filePath, decisions) {
  fs.writeFileSync(
    filePath,
    JSON.stringify(
      {
        schema_version: "1.0.0",
        decisions,
      },
      null,
      2
    ),
    "utf8"
  );
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
      assert.deepEqual(report.unresolved_opponents.recommended_action_row_counts, { ignore_low_frequency: 1 });
      assert.equal(report.unresolved_opponents.by_recommended_action.ignore_low_frequency.length, 1);
      assert.deepEqual(report.fallback_dependency, {
        rows_requiring_name_fallback: 1,
        rows_requiring_name_fallback_pct: 33.33,
        unresolved_unique_names: 1,
        metadata_review_rows: 0,
        manual_disambiguation_rows: 0,
        external_or_metadata_review_rows: 0,
        external_candidate_rows: 0,
        reviewed_external_rows: 0,
        reviewed_canonical_candidate_rows: 0,
        ignored_low_frequency_rows: 1,
        ready_to_remove_name_fallback: false,
      });
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
      recommended_action_row_counts: { ignore_low_frequency: 1 },
      operator_review_queue: {
        total_names: 0,
        total_rows: 0,
        limit: 50,
        items: [],
      },
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
  assert.match(markdown, /Fallback Dependency/);
  assert.match(markdown, /rows_requiring_name_fallback: 1/);
  assert.match(markdown, /Operator Review Queue/);
  assert.match(markdown, /total_names: 0/);
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

runTest("buildCoverageReport uses reviewed opponent aliases only for known roster entities", () => {
  withFixtureDir((dir) => {
    writeArtifact(dir, "player-a.json", [
      { opponent_entity_id: "", opponent_name: "legacy opponent", opponent_race: "P", match_date: "2026-05-20" },
      { opponent_entity_id: "", opponent_name: "unknown alias", opponent_race: "T", match_date: "2026-05-20" },
    ]);

    withProjectDir((projectsDir) => {
      const aliasPath = path.join(dir, "opponent_identity_aliases.v1.json");
      writeAliasFile(aliasPath, [
        {
          entity_id: "eloboard:female:4",
          aliases: ["legacy opponent"],
          source: "ops_review",
        },
        {
          entity_id: "eloboard:missing:999",
          aliases: ["unknown alias"],
          source: "ops_review",
        },
      ]);

      const report = buildCoverageReport({
        artifactDir: dir,
        projectsDir,
        aliasPath,
        generatedAt: "2026-05-21T00:00:00.000Z",
      });

      const byName = Object.fromEntries(
        report.unresolved_opponents.top.map((row) => [row.opponent_name, row])
      );
      assert.equal(byName["legacy opponent"].candidate_status, "unique_candidate");
      assert.equal(byName["legacy opponent"].candidates[0].entity_id, "eloboard:female:4");
      assert.equal(byName["legacy opponent"].recommended_action, "metadata_review_needed");
      assert.equal(byName["unknown alias"].candidate_status, "no_candidate");
      assert.equal(byName["unknown alias"].candidate_count, 0);
    });
  });
});

runTest("loadOpponentIdentityAliases tolerates missing files and normalizes alias rows", () => {
  withFixtureDir((dir) => {
    assert.deepEqual(loadOpponentIdentityAliases(path.join(dir, "missing.json")), []);

    const aliasPath = path.join(dir, "opponent_identity_aliases.v1.json");
    writeAliasFile(aliasPath, [
      {
        entity_id: " eloboard:female:4 ",
        aliases: [" Legacy Opponent ", "", null],
        source: "ops_review",
      },
      {
        entity_id: "",
        aliases: ["ignored"],
      },
    ]);

    assert.deepEqual(loadOpponentIdentityAliases(aliasPath), [
      {
        entity_id: "eloboard:female:4",
        aliases: ["Legacy Opponent"],
        source: "ops_review",
      },
    ]);
  });
});

runTest("loadOpponentReviewDecisions keeps only explicit external and canonical decisions", () => {
  withFixtureDir((dir) => {
    assert.deepEqual(loadOpponentReviewDecisions(path.join(dir, "missing.json")), new Map());

    const decisionsPath = path.join(dir, "opponent_identity_review_decisions.v1.json");
    writeDecisionFile(decisionsPath, [
      { opponent_name: " Reviewed External ", decision: "external_opponent" },
      { opponent_name: "Canonical", decision: "canonical_candidate" },
      { opponent_name: "Ignored", decision: "defer" },
      { opponent_name: "", decision: "external_opponent" },
    ]);

    const decisions = loadOpponentReviewDecisions(decisionsPath);
    assert.equal(decisions.get("reviewedexternal").decision, "external_opponent");
    assert.equal(decisions.get("canonical").decision, "canonical_candidate");
    assert.equal(decisions.has("ignored"), false);
  });
});

runTest("buildCoverageReport excludes reviewed external opponents from operator queue", () => {
  withFixtureDir((dir) => {
    writeArtifact(dir, "player-a.json", [
      { opponent_entity_id: "", opponent_name: "reviewed external", opponent_race: "Z", match_date: "2026-05-20" },
      ...Array.from({ length: 25 }, () => ({
        opponent_entity_id: "",
        opponent_name: "needs review",
        opponent_race: "T",
        match_date: "2026-05-20",
      })),
    ]);
    const decisionsPath = path.join(dir, "opponent_identity_review_decisions.v1.json");
    writeDecisionFile(decisionsPath, [
      { opponent_name: "reviewed external", decision: "external_opponent" },
    ]);

    withProjectDir((projectsDir) => {
      const report = buildCoverageReport({
        artifactDir: dir,
        projectsDir,
        aliasPath: null,
        reviewDecisionsPath: decisionsPath,
        generatedAt: "2026-05-21T00:00:00.000Z",
      });

      assert.deepEqual(report.unresolved_opponents.recommended_action_counts, {
        external_candidate: 1,
        reviewed_external_opponent: 1,
      });
      assert.equal(report.fallback_dependency.reviewed_external_rows, 1);
      assert.deepEqual(
        report.unresolved_opponents.operator_review_queue.items.map((item) => item.opponent_name),
        ["needs review"]
      );
    });
  });
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
  assert.deepEqual(summary.recommended_action_row_counts, {
    ignore_low_frequency: 2,
    metadata_review_needed: 105,
  });
  assert.equal(summary.operator_review_queue.total_names, 1);
  assert.equal(summary.operator_review_queue.total_rows, 105);
  assert.equal(summary.operator_review_queue.items[0].opponent_name, "a");
  assert.equal(summary.operator_review_queue.items[0].decision_prompt, "approve_alias_or_reject");
  assert.equal(summary.by_recommended_action.metadata_review_needed[0].opponent_name, "a");
});

runTest("buildOperatorReviewQueue excludes low-frequency rows and adds decision prompts", () => {
  const queue = buildOperatorReviewQueue(
    [
      {
        opponent_name: "high",
        match_rows: 120,
        latest_match_date: "2026-05-01",
        opponent_race_counts: { T: 100, P: 20 },
        player_samples: [
          { player_entity_id: "eloboard:female:1", player_name: "sample-a" },
          { player_entity_id: "eloboard:male:2", player_name: "sample-b" },
        ],
        candidate_status: "no_candidate",
        candidate_count: 0,
        candidates: [],
        recommended_action: "external_or_metadata_review_needed",
      },
      {
        opponent_name: "alias",
        match_rows: 30,
        latest_match_date: "2026-04-01",
        opponent_race_counts: { Z: 30 },
        player_samples: [{ player_entity_id: "eloboard:female:3", player_name: "sample-c" }],
        candidate_status: "unique_candidate",
        candidate_count: 1,
        candidates: [{ entity_id: "eloboard:female:10", name: "alias canonical", team_code: "nzu" }],
        recommended_action: "metadata_review_needed",
      },
      {
        opponent_name: "small",
        match_rows: 2,
        latest_match_date: "2026-03-01",
        candidate_status: "no_candidate",
        candidate_count: 0,
        recommended_action: "ignore_low_frequency",
      },
    ],
    10
  );

  assert.equal(queue.total_names, 2);
  assert.equal(queue.total_rows, 150);
  assert.deepEqual(
    queue.items.map((row) => [row.rank, row.opponent_name, row.decision_prompt]),
    [
      [1, "high", "classify_as_canonical_or_external"],
      [2, "alias", "approve_alias_or_reject"],
    ]
  );
  assert.deepEqual(queue.items[0].opponent_race_counts, { T: 100, P: 20 });
  assert.deepEqual(queue.items[0].player_samples, [
    { player_entity_id: "eloboard:female:1", player_name: "sample-a" },
    { player_entity_id: "eloboard:male:2", player_name: "sample-b" },
  ]);
  assert.deepEqual(queue.items[1].candidate_preview, [
    { entity_id: "eloboard:female:10", name: "alias canonical", display_name: "", team_code: "nzu" },
  ]);
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

runTest("writeReport writes operator review queue JSON and CSV artifacts", () => {
  withFixtureDir((dir) => {
    const report = {
      generated_at: "2026-05-21T00:00:00.000Z",
      artifact_dir: "tmp/player-history-artifacts",
      artifact_files: 1,
      players_with_history: 1,
      match_rows: 120,
      rows_with_opponent_entity_id: 0,
      rows_with_opponent_name: 120,
      opponent_entity_id_coverage_pct: 0,
      opponent_name_coverage_pct: 100,
      ready_to_remove_name_fallback: false,
      incomplete_samples: [],
      unresolved_opponents: {
        missing_rows: 120,
        unique_names: 1,
        no_candidate_names: 1,
        ambiguous_candidate_names: 0,
        unique_candidate_names: 0,
        recommended_action_counts: { external_candidate: 1 },
        recommended_action_row_counts: { external_candidate: 120 },
        operator_review_queue: {
          total_names: 1,
          total_rows: 120,
          limit: 50,
          items: [
            {
              rank: 1,
              opponent_name: "comma, name",
              match_rows: 120,
              latest_match_date: "2026-05-20",
              candidate_status: "no_candidate",
              candidate_count: 0,
              opponent_race_counts: { T: 90, P: 30 },
              player_samples: [{ player_entity_id: "eloboard:female:1", player_name: "sample player" }],
              candidate_preview: [],
              recommended_action: "external_candidate",
              decision_prompt: "mark_external_or_leave_unrecorded",
            },
          ],
        },
        by_recommended_action: {},
        top: [],
      },
    };

    const written = writeReport(report, {
      jsonPath: path.join(dir, "coverage.json"),
      markdownPath: path.join(dir, "coverage.md"),
      reviewQueueJsonPath: path.join(dir, "review-queue.json"),
      reviewQueueCsvPath: path.join(dir, "review-queue.csv"),
    });

    assert.equal(path.basename(written.reviewQueueJsonPath), "review-queue.json");
    assert.equal(path.basename(written.reviewQueueCsvPath), "review-queue.csv");

    const queue = JSON.parse(fs.readFileSync(written.reviewQueueJsonPath, "utf8"));
    assert.equal(queue.total_names, 1);
    assert.equal(queue.items[0].opponent_name, "comma, name");

    const csv = fs.readFileSync(written.reviewQueueCsvPath, "utf8");
    assert.ok(csv.startsWith("\uFEFFrank,"), "review queue CSV should include a UTF-8 BOM for Excel");
    assert.match(
      csv,
      /^\uFEFFrank,opponent_name,match_rows,latest_match_date,candidate_status,candidate_count,recommended_action,decision_prompt,opponent_race_counts,player_samples,candidate_preview/m
    );
    assert.match(
      csv,
      /1,"comma, name",120,2026-05-20,no_candidate,0,external_candidate,mark_external_or_leave_unrecorded,T:90; P:30,sample player \(eloboard:female:1\),/
    );
  });
});
