const fs = require("fs");
const os = require("os");
const path = require("path");
const assert = require("node:assert/strict");

const {
  isComparablePriorSnapshot,
  latestPreviousSnapshotPath,
  parseDateTag,
} = require("./lib/daily-pipeline-snapshot");
const {
  buildAlerts,
  buildClusteredUncertainAffiliationAlerts,
  buildHomepageIntegrityOperationalAlerts,
  movedInPlayersByTeam,
} = require("./run-daily-pipeline");
const { classifyZeroRecordPlayers, exportConcurrencyForTeam, exportTimeoutForTeam } = require("./run-daily-pipeline");
const OPS_TEAM_LABEL = "\uC6B4\uC601";

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

runTest("buildAlerts surfaces roster players excluded by an external-opponent name rule", () => {
  const actual = buildAlerts(
    [
      {
        team: "신세계",
        team_code: "ssg",
        zero_players: "",
        fetch_fail: 0,
        csv_fail: 0,
        delta_total_matches: 0,
        delta_players: 0,
        opponent_name_excluded_players: 1,
        opponent_name_excluded_player_names: "김설",
      },
    ],
    {
      rules: {
        zero_record_players_severity: "high",
        negative_delta_matches_severity: "critical",
        roster_size_changed_severity: "medium",
        roster_size_changed_team_allowlist: [],
        no_new_matches_enabled: false,
      },
    },
    null,
    []
  );

  const hit = actual.find((row) => row.rule === "roster_player_excluded_by_opponent_name");
  assert.ok(hit, "이름 충돌로 제외된 로스터 선수는 경보로 떠야 한다");
  assert.equal(hit.team_code, "ssg");
  // 선수 한 명 때문에 서빙 동기화 전체가 막히면 안 되므로 차단 등급(critical/high)이 아니어야 한다.
  assert.equal(hit.severity, "medium");
  assert.match(hit.message, /김설/);
});

runTest("buildAlerts stays quiet when no roster player is caught by a name rule", () => {
  const actual = buildAlerts(
    [
      {
        team: "신세계",
        team_code: "ssg",
        zero_players: "",
        fetch_fail: 0,
        csv_fail: 0,
        delta_total_matches: 0,
        delta_players: 0,
        opponent_name_excluded_players: 0,
        opponent_name_excluded_player_names: "",
      },
    ],
    {
      rules: {
        zero_record_players_severity: "high",
        negative_delta_matches_severity: "critical",
        roster_size_changed_severity: "medium",
        roster_size_changed_team_allowlist: [],
        no_new_matches_enabled: false,
      },
    },
    null,
    []
  );

  assert.equal(
    actual.some((row) => row.rule === "roster_player_excluded_by_opponent_name"),
    false
  );
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

// 0건 경보는 이제 이름 허용목록이 아니라 "관측 근거"로 판정한다.
// 읽기 성공 + 0건 = 엘로보드에도 경기가 없다는 증명 → 경보 없음.
const ZERO_RECORD_RULES = {
  rules: {
    zero_record_players_severity: "high",
    negative_delta_matches_severity: "critical",
    roster_size_changed_severity: "medium",
    roster_size_changed_team_allowlist: [],
    no_new_matches_enabled: false,
  },
};

runTest("buildAlerts stays quiet for observed zero-record players (eloboard read succeeded)", () => {
  const actual = buildAlerts(
    [
      {
        team: "연합팀",
        team_code: "fa",
        zero_players: "고요, 권혁진",
        zero_players_detail: [
          { name: "고요", fetch_status: "ok" },
          { name: "권혁진", fetch_status: "used_existing_json" },
        ],
        fetch_fail: 0,
        csv_fail: 0,
        delta_total_matches: 0,
        delta_players: 0,
      },
    ],
    ZERO_RECORD_RULES,
    null,
    []
  );

  assert.deepEqual(actual, []);
});

runTest("buildAlerts alerts on zero-record players whose fetch failed (no observation basis)", () => {
  const actual = buildAlerts(
    [
      {
        team: "연합팀",
        team_code: "fa",
        zero_players: "고요, 권혁진",
        zero_players_detail: [
          { name: "고요", fetch_status: "failed" },
          { name: "권혁진", fetch_status: "ok" },
        ],
        fetch_fail: 0,
        csv_fail: 0,
        delta_total_matches: 0,
        delta_players: 0,
      },
    ],
    ZERO_RECORD_RULES,
    null,
    []
  );

  // 권혁진은 관측된 0건이라 빠지고, 읽기 실패한 고요만 경보에 남는다.
  const hit = actual.find((row) => row.rule === "zero_record_players");
  assert.ok(hit, "관측 근거 없는 0건은 경보로 떠야 한다");
  assert.equal(hit.severity, "high");
  assert.equal(hit.message, "zero_record_players=1 (고요)");
});

runTest("buildAlerts treats zero-record players without detail (old snapshot) as needs review", () => {
  const actual = buildAlerts(
    [
      {
        team: "연합팀",
        team_code: "fa",
        zero_players: "고요",
        // zero_players_detail 없음 = 구버전 스냅샷. 관측 근거를 확인할 수 없으니 안전하게 경보.
        fetch_fail: 0,
        csv_fail: 0,
        delta_total_matches: 0,
        delta_players: 0,
      },
    ],
    ZERO_RECORD_RULES,
    null,
    []
  );

  const hit = actual.find((row) => row.rule === "zero_record_players");
  assert.ok(hit, "detail이 없으면 안전하게 경보로 떠야 한다");
  assert.equal(hit.message, "zero_record_players=1 (고요)");
});

runTest("buildHomepageIntegrityOperationalAlerts adds medium alert for fresh stale-snapshot disagreement reports", () => {
  const referenceTime = Date.parse("2026-04-12T09:00:00.000Z");
  const actual = buildHomepageIntegrityOperationalAlerts(
    {
      generated_at: "2026-04-12T08:15:00.000Z",
      summary: {
        live: {
          snapshot_exists: true,
          snapshot_is_fresh: false,
          snapshot_updated_at: "2026-04-12T07:30:00.000Z",
          stale_snapshot_disagreement_count: 103,
        },
      },
    },
    {
      rules: {
        stale_snapshot_disagreement_severity: "medium",
        stale_snapshot_disagreement_threshold: 1,
        homepage_integrity_report_max_age_minutes: 180,
      },
    },
    referenceTime
  );

  assert.deepEqual(actual, [
    {
      severity: "medium",
      team: "운영",
      team_code: "ops",
      rule: "stale_live_snapshot_disagreement",
      message:
        "stale_snapshot_disagreement_count=103, snapshot_updated_at=2026-04-12T07:30:00.000Z, report_generated_at=2026-04-12T08:15:00.000Z",
    },
  ]);
});

runTest("buildHomepageIntegrityOperationalAlerts ignores stale integrity reports", () => {
  const referenceTime = Date.parse("2026-04-12T12:30:00.000Z");
  const actual = buildHomepageIntegrityOperationalAlerts(
    {
      generated_at: "2026-04-12T08:15:00.000Z",
      summary: {
        live: {
          snapshot_exists: true,
          snapshot_is_fresh: false,
          snapshot_updated_at: "2026-04-12T07:30:00.000Z",
          stale_snapshot_disagreement_count: 103,
        },
      },
    },
    {
      rules: {
        stale_snapshot_disagreement_severity: "medium",
        stale_snapshot_disagreement_threshold: 1,
        homepage_integrity_report_max_age_minutes: 180,
      },
    },
    referenceTime
  );

  assert.deepEqual(actual, []);
});

runTest("buildHomepageIntegrityOperationalAlerts raises a medium ops alert for degraded match-history quality", () => {
  const referenceTime = Date.parse("2026-04-12T09:00:00.000Z");
  const actual = buildHomepageIntegrityOperationalAlerts(
    {
      generated_at: "2026-04-12T08:15:00.000Z",
      summary: {
        match_history: {
          total_match_history_rows: 1000,
          opponent_name_fill_rate: 0.91,
          players_with_blank_opponent_rows: 12,
        },
      },
    },
    {
      rules: {
        match_history_quality_severity: "medium",
        match_history_opponent_name_fill_rate_threshold: 0.98,
        match_history_blank_player_threshold: 3,
        homepage_integrity_report_max_age_minutes: 180,
      },
    },
    referenceTime
  );

  assert.equal(actual.length, 1);
  assert.equal(actual[0].severity, "medium");
  assert.equal(actual[0].team_code, "ops");
  assert.equal(actual[0].rule, "match_history_quality_degraded");
  assert.equal(
    actual[0].message,
    "opponent_name_fill_rate=0.91, blank_players=12, total_rows=1000, report_generated_at=2026-04-12T08:15:00.000Z"
  );
});

runTest("buildHomepageIntegrityOperationalAlerts ignores healthy match-history quality", () => {
  const referenceTime = Date.parse("2026-04-12T09:00:00.000Z");
  const actual = buildHomepageIntegrityOperationalAlerts(
    {
      generated_at: "2026-04-12T08:15:00.000Z",
      summary: {
        match_history: {
          total_match_history_rows: 1000,
          opponent_name_fill_rate: 0.999,
          players_with_blank_opponent_rows: 1,
        },
      },
    },
    {
      rules: {
        match_history_quality_severity: "medium",
        match_history_opponent_name_fill_rate_threshold: 0.98,
        match_history_blank_player_threshold: 3,
        homepage_integrity_report_max_age_minutes: 180,
      },
    },
    referenceTime
  );

  assert.deepEqual(actual, []);
});

runTest("buildClusteredUncertainAffiliationAlerts raises a medium ops alert for clustered fallback moves", () => {
  const actual = buildClusteredUncertainAffiliationAlerts(
    {
      summary: {
        moved: [
          { from: "black", to: "fa", change_confidence: "fallback" },
          { from: "wfu", to: "fa", change_confidence: "fallback" },
          { from: "ssu", to: "fa", change_confidence: "fallback" },
        ],
      },
    },
    {
      rules: {
        clustered_uncertain_affiliation_changes_severity: "medium",
        clustered_uncertain_affiliation_changes_threshold: 3,
      },
    }
  );

  assert.deepEqual(actual, [
    {
      severity: "medium",
      team: "?댁쁺",
      team_code: "ops",
      rule: "clustered_uncertain_affiliation_changes",
      message: "count=3, fallback=3, inferred=0, previous_teams=black:1, ssu:1, wfu:1",
    },
  ]);
});

runTest("buildAlerts includes clustered uncertain-affiliation review alerts", () => {
  const actual = buildAlerts(
    [],
    {
      rules: {
        clustered_uncertain_affiliation_changes_severity: "medium",
        clustered_uncertain_affiliation_changes_threshold: 2,
      },
    },
    {
      summary: {
        moved: [
          { from: "black", to: "fa", change_confidence: "fallback" },
          { from: "wfu", to: "fa", change_confidence: "inferred" },
        ],
      },
    },
    []
  );

  assert.deepEqual(actual, [
    {
      severity: "medium",
      team: "?댁쁺",
      team_code: "ops",
      rule: "clustered_uncertain_affiliation_changes",
      message: "count=2, fallback=1, inferred=1, previous_teams=black:1, wfu:1",
    },
  ]);
});

runTest("exportConcurrencyForTeam forces higher concurrency for fa", () => {
  assert.equal(exportConcurrencyForTeam("fa", "1"), "2");
  assert.equal(exportConcurrencyForTeam("fa", "3"), "3");
  assert.equal(exportConcurrencyForTeam("jsa", "1"), "1");
});

runTest("exportTimeoutForTeam extends timeout for fa only", () => {
  assert.equal(exportTimeoutForTeam("fa"), 1800000);
  assert.equal(exportTimeoutForTeam("jsa"), 900000);
});

runTest("classifyZeroRecordPlayers marks observed 0-records quiet and unobserved ones for review", () => {
  const actual = classifyZeroRecordPlayers(
    [
      {
        team: "연합팀",
        team_code: "fa",
        zero_players: "관측선수, 실패선수",
        zero_players_detail: [
          // 읽기 성공 → 관측된 0건 → 경보 대상 아님
          { name: "관측선수", fetch_status: "used_existing_json" },
          // 읽기 실패 → 근거 없는 0건 → 판단 필요
          { name: "실패선수", fetch_status: "failed" },
        ],
      },
      {
        team: "구버전팀",
        team_code: "old",
        // detail 없음(구버전 스냅샷) → 관측 근거 확인 불가 → 안전하게 needs_review
        zero_players: "무디테일선수",
      },
    ],
    { rules: {} }
  );

  assert.equal(actual.total, 3);
  assert.equal(actual.counts.observed_zero, 1);
  assert.equal(actual.counts.needs_review, 2);
  assert.equal(actual.needs_review_count, 2);
});
