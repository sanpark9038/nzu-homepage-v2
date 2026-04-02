const fs = require("fs");
const os = require("os");
const path = require("path");
const assert = require("node:assert/strict");

const {
  isComparablePriorSnapshot,
  latestPreviousSnapshotPath,
  parseDateTag,
} = require("./lib/daily-pipeline-snapshot");
const { buildAlerts, movedInPlayersByTeam } = require("./run-daily-pipeline");

function makeTempReportsDir() {
  return fs.mkdtempSync(path.join(os.tmpdir(), "nzu-daily-pipeline-"));
}

function runTest(name, fn) {
  try {
    fn();
    console.log(`PASS ${name}`);
  } catch (error) {
    console.error(`FAIL ${name}`);
    throw error;
  }
}

runTest("latestPreviousSnapshotPath keeps same-day final snapshot when current tag is chunked", () => {
  const reportsDir = makeTempReportsDir();
  fs.writeFileSync(path.join(reportsDir, "daily_pipeline_snapshot_2026-03-26.json"), "{}");
  fs.writeFileSync(path.join(reportsDir, "daily_pipeline_snapshot_2026-03-25.json"), "{}");
  fs.writeFileSync(path.join(reportsDir, "daily_pipeline_snapshot_2026-03-27.json"), "{}");

  const actual = latestPreviousSnapshotPath("2026-03-27_080957-chunk1", reportsDir);

  assert.equal(actual, path.join(reportsDir, "daily_pipeline_snapshot_2026-03-27.json"));
});

runTest("latestPreviousSnapshotPath returns null when only same-day snapshot exists", () => {
  const reportsDir = makeTempReportsDir();
  fs.writeFileSync(path.join(reportsDir, "daily_pipeline_snapshot_2026-03-27.json"), "{}");

  const actual = latestPreviousSnapshotPath("2026-03-27", reportsDir);

  assert.equal(actual, null);
});

runTest("isComparablePriorSnapshot requires same period_from and earlier prior period_to", () => {
  const prior = {
    period_from: "2025-01-01",
    period_to: "2026-03-26",
  };

  assert.equal(isComparablePriorSnapshot(prior, "2025-01-01", "2026-03-27"), true);
  assert.equal(isComparablePriorSnapshot(prior, "2025-02-01", "2026-03-27"), false);
  assert.equal(isComparablePriorSnapshot(prior, "2025-01-01", "2026-03-26"), false);
  assert.equal(isComparablePriorSnapshot(prior, "2025-01-01", "bad-date"), false);
});

runTest("parseDateTag returns null for non-YYYY-MM-DD text", () => {
  assert.equal(parseDateTag("2026-03-27"), Date.parse("2026-03-27T00:00:00Z"));
  assert.equal(parseDateTag("2026-03-27_080957-chunk1"), null);
  assert.equal(parseDateTag(""), null);
});

runTest("movedInPlayersByTeam groups roster sync moves by destination team", () => {
  const actual = movedInPlayersByTeam({
    summary: {
      moved: [
        { name: "김무아", from: "fa", to: "jsa" },
        { name: "엄보리", from: "fa", to: "jsa" },
        { name: "또해영", from: "ku", to: "fa" },
      ],
    },
  });

  assert.deepEqual([...actual.get("jsa")].sort(), ["김무아", "엄보리"]);
  assert.deepEqual([...actual.get("fa")], ["또해영"]);
});

runTest("buildAlerts ignores moved-in zero-record players for the current run", () => {
  const actual = buildAlerts(
    [
      {
        team: "연합팀",
        team_code: "fa",
        zero_players: "또해영, 욱하는형, 기존선수",
        fetch_fail: 0,
        csv_fail: 0,
        delta_total_matches: -10,
        delta_players: -1,
      },
      {
        team: "JSA",
        team_code: "jsa",
        zero_players: "김무아, 엄보리",
        fetch_fail: 0,
        csv_fail: 0,
        delta_total_matches: 0,
        delta_players: 2,
      },
    ],
    {
      rules: {
        zero_record_players_severity: "high",
        zero_record_players_allowlist: {},
        negative_delta_matches_severity: "critical",
        roster_size_changed_severity: "medium",
        roster_size_changed_team_allowlist: ["fa"],
        no_new_matches_enabled: false,
      },
    },
    {
      summary: {
        moved: [
          { name: "또해영", from: "ku", to: "fa" },
          { name: "욱하는형", from: "ncs", to: "fa" },
          { name: "김무아", from: "fa", to: "jsa" },
          { name: "엄보리", from: "fa", to: "jsa" },
        ],
      },
    },
    [
      {
        team: "JSA",
        team_code: "jsa",
        baseline_players: 18,
        current_players: 20,
        added_entity_ids: ["eloboard:male:1", "eloboard:female:2"],
        removed_entity_ids: [],
        changed: true,
      },
    ]
  );

  assert.deepEqual(actual, [
    {
      severity: "high",
      team: "연합팀",
      team_code: "fa",
      rule: "zero_record_players",
      message: "zero_record_players=1 (기존선수)",
    },
    {
      severity: "medium",
      team: "JSA",
      team_code: "jsa",
      rule: "roster_size_changed",
      message: "delta_players=2",
    },
    {
      severity: "medium",
      team: "JSA",
      team_code: "jsa",
      rule: "roster_transition_detected",
      message: "baseline=18, current=20, added=2, removed=0",
    },
  ]);
});

runTest("buildAlerts suppresses stale roster_size_changed alerts when current run has no roster transition", () => {
  const actual = buildAlerts(
    [
      {
        team: "JSA",
        team_code: "jsa",
        zero_players: "",
        fetch_fail: 0,
        csv_fail: 0,
        delta_total_matches: 100,
        delta_players: 4,
      },
    ],
    {
      rules: {
        zero_record_players_severity: "high",
        zero_record_players_allowlist: {},
        negative_delta_matches_severity: "critical",
        roster_size_changed_severity: "medium",
        roster_size_changed_team_allowlist: [],
        no_new_matches_enabled: false,
      },
    },
    null,
    [
      {
        team: "JSA",
        team_code: "jsa",
        baseline_players: 22,
        current_players: 22,
        added_entity_ids: [],
        removed_entity_ids: [],
        changed: false,
      },
    ]
  );

  assert.deepEqual(actual, []);
});

runTest("buildAlerts suppresses blocking alerts for teams with roster transitions", () => {
  const actual = buildAlerts(
    [
      {
        team: "흑카데미",
        team_code: "black",
        zero_players: "빡재TV, 우힝이",
        fetch_fail: 0,
        csv_fail: 0,
        delta_total_matches: -6638,
        delta_players: 0,
      },
    ],
    {
      rules: {
        zero_record_players_severity: "high",
        zero_record_players_allowlist: {},
        negative_delta_matches_severity: "critical",
        roster_size_changed_severity: "medium",
        roster_size_changed_team_allowlist: [],
        no_new_matches_enabled: false,
      },
    },
    null,
    [
      {
        team: "흑카데미",
        team_code: "black",
        baseline_players: 16,
        current_players: 16,
        added_entity_ids: ["eloboard:male:913"],
        removed_entity_ids: ["eloboard:male:mix:913"],
        changed: true,
      },
    ]
  );

  assert.deepEqual(actual, [
    {
      severity: "medium",
      team: "흑카데미",
      team_code: "black",
      rule: "roster_transition_detected",
      message: "baseline=16, current=16, added=1, removed=1",
    },
  ]);
});

runTest("buildAlerts suppresses roster transition alerts for allowlisted teams", () => {
  const actual = buildAlerts(
    [
      {
        team: "연합팀",
        team_code: "fa",
        zero_players: "",
        fetch_fail: 0,
        csv_fail: 0,
        delta_total_matches: -22707,
        delta_players: -65,
      },
    ],
    {
      rules: {
        zero_record_players_severity: "high",
        zero_record_players_allowlist: {},
        negative_delta_matches_severity: "critical",
        roster_size_changed_severity: "medium",
        roster_size_changed_team_allowlist: ["fa"],
        no_new_matches_enabled: false,
      },
    },
    null,
    [
      {
        team: "연합팀",
        team_code: "fa",
        baseline_players: 91,
        current_players: 21,
        added_entity_ids: [],
        removed_entity_ids: Array.from({ length: 70 }, (_, i) => `entity-${i + 1}`),
        changed: true,
      },
    ]
  );

  assert.deepEqual(actual, []);
});
