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
const {
  classifyZeroRecordPlayers,
  exportConcurrencyForTeam,
  exportTimeoutForTeam,
  summarizeTeamFromReport,
} = require("./run-daily-pipeline");
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

runTest("buildAlerts surfaces roster players whose name overlaps an external-opponent decision", () => {
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
        opponent_name_overlap_players: 1,
        opponent_name_overlap_player_names: "김설",
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
  assert.ok(hit, "이름이 외부인 결정과 겹치는 로스터 선수는 경보로 떠야 한다");
  assert.equal(hit.team_code, "ssg");
  // 선수 한 명의 이름 충돌로 서빙 동기화 전체가 막히면 안 되므로 차단 등급(critical/high)이 아니어야 한다.
  assert.equal(hit.severity, "medium");
  assert.match(hit.message, /김설/);
  // 수집은 계속된다는 새 의미가 메시지에 담겨야 한다.
  assert.match(hit.message, /수집은 계속된다/);
});

runTest("buildAlerts stays quiet when no roster player name overlaps a decision", () => {
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
        opponent_name_overlap_players: 0,
        opponent_name_overlap_player_names: "",
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

// full_scans: 오늘 실제로 수집한 선수 중 처음부터 다 훑은 수. 책갈피 증분이 먹고 있는지 보는
// 유일한 지표라, 두 곳(export 보고서의 fetch_status + 선수 json의 scan_strategy)을 함께 읽는다.
runTest("summarizeTeamFromReport counts full_scan only among players actually collected", () => {
  const dir = makeTempReportsDir();
  const write = (name, scanStrategy) => {
    const p = path.join(dir, name);
    fs.writeFileSync(
      p,
      JSON.stringify({ players: [{ period_total: 5, period_wins: 3, period_losses: 2, scan_strategy: scanStrategy }] }),
      "utf8"
    );
    return p;
  };
  const report = {
    results: [
      { player: "a", fetch_status: "ok", csv_status: "ok", json_path: write("a.json", "full_scan") },
      { player: "b", fetch_status: "ok", csv_status: "ok", json_path: write("b.json", "incremental_cache_merge") },
      // 재사용은 오늘 수집한 것이 아니다 — 파일에 남은 옛 full_scan 표식을 세면 안 된다.
      {
        player: "c",
        fetch_status: "used_existing_json",
        csv_status: "used_existing_csv",
        json_path: write("c.json", "full_scan"),
      },
    ],
  };

  const row = summarizeTeamFromReport({ univ: "팀", code: "tm" }, report);
  assert.equal(row.full_scans, 1);
  assert.equal(row.fetched_players, 2);
  assert.equal(row.reused_players, 1);
});

// 2026-08 여자부 개편: 여자부는 연도 전량 조회(yearly_full_read)로 바뀌었다. 이름만 다를 뿐
// "처음부터 다 훑었다"와 같은 등급이라, 여기서 안 세면 full_scans가 0으로 보이고 회귀 가드의
// "실제 감소" 판정이 여자부 전원을 놓친다.
runTest("summarizeTeamFromReport counts yearly_full_read as a full scan", () => {
  const dir = makeTempReportsDir();
  const write = (name, scanStrategy) => {
    const p = path.join(dir, name);
    fs.writeFileSync(
      p,
      JSON.stringify({ players: [{ period_total: 5, period_wins: 3, period_losses: 2, scan_strategy: scanStrategy }] }),
      "utf8"
    );
    return p;
  };
  const report = {
    results: [
      { player: "진서", fetch_status: "ok", csv_status: "ok", json_path: write("a.json", "yearly_full_read") },
      {
        player: "안아",
        fetch_status: "used_existing_json_regression_guard",
        csv_status: "used_existing_csv",
        verify_scan_strategy: "yearly_full_read",
        json_path: write("b.json", "yearly_full_read"),
      },
    ],
  };

  const row = summarizeTeamFromReport({ univ: "팀", code: "tm" }, report);
  assert.equal(row.full_scans, 1);
  assert.equal(row.verify_mismatch_players, 1);
  assert.equal(row.verify_mismatch_player_names, "안아");
});

// rotation_verified는 full_scans와 다른 지표다. full_scans는 "책갈피 없이 처음부터 훑은 수",
// rotation_verified는 "R3 보험 차례가 와서 강제로 전체 정독한 수"다. 섞이면 둘 다 못 읽는다.
runTest("summarizeTeamFromReport counts rotation_verified separately from full_scans", () => {
  const dir = makeTempReportsDir();
  const write = (name, scanStrategy) => {
    const p = path.join(dir, name);
    fs.writeFileSync(
      p,
      JSON.stringify({ players: [{ period_total: 5, period_wins: 3, period_losses: 2, scan_strategy: scanStrategy }] }),
      "utf8"
    );
    return p;
  };
  const report = {
    results: [
      // 순환 정독 대상이고 실제로 읽혔다 → rotation_verified + full_scans 둘 다
      {
        player: "a",
        fetch_status: "ok",
        csv_status: "ok",
        rotation_full_verify: true,
        json_path: write("a.json", "full_scan"),
      },
      // 순환과 무관한 full_scan → full_scans만
      { player: "b", fetch_status: "ok", csv_status: "ok", json_path: write("b.json", "full_scan") },
      // 순환 대상이지만 읽기 실패 → 정독됐다고 셀 수 없다
      {
        player: "c",
        fetch_status: "failed",
        csv_status: "ok",
        rotation_full_verify: true,
        json_path: write("c.json", "full_scan"),
      },
    ],
  };

  const row = summarizeTeamFromReport({ univ: "팀", code: "tm" }, report);
  assert.equal(row.rotation_verified, 1);
  assert.equal(row.full_scans, 2);
});

// 회귀 가드(다시 읽은 total이 기존보다 적다)는 FETCH_OK_STATES라 지금껏 아침 보고에 안 떴다.
// 조용한 삭제·정정의 유일한 신호이므로 팀 행에 수와 이름으로 올라와야 한다.
runTest("summarizeTeamFromReport surfaces regression-guard players as verify mismatches", () => {
  const dir = makeTempReportsDir();
  const write = (name) => {
    const p = path.join(dir, name);
    fs.writeFileSync(p, JSON.stringify({ players: [{ period_total: 5 }] }), "utf8");
    return p;
  };
  const report = {
    results: [
      {
        player: "김설",
        fetch_status: "used_existing_json_regression_guard",
        csv_status: "used_existing_csv",
        rotation_full_verify: true,
        verify_scan_strategy: "full_scan",
        json_path: write("kim.json"),
      },
      { player: "b", fetch_status: "ok", csv_status: "ok", json_path: write("b.json") },
      // 제외된 선수는 판정 대상이 아니다.
      { player: "c", excluded: true, fetch_status: "used_existing_json_regression_guard", csv_status: "excluded" },
    ],
  };

  const row = summarizeTeamFromReport({ univ: "팀", code: "tm" }, report);
  assert.equal(row.verify_mismatch_players, 1);
  assert.equal(row.verify_mismatch_player_names, "김설");
  // 회귀 가드는 실패가 아니다 — 기존 파일을 지킨 정상 동작이므로 fetch_fail로 세면 안 된다.
  assert.equal(row.fetch_fail, 0);
});

// 2026-07-28 첫 실전 오탐: 혼성 보드 선수는 수집이 꺼져 있어 정독해도 관측 없이 0건이 나오는데,
// 그 0건이 "기존보다 적다"로 오인돼 mismatch 11건이 전부 오탐이었다. 실제로 읽은 경우만 판정한다.
runTest("summarizeTeamFromReport ignores regression guards that observed nothing", () => {
  const dir = makeTempReportsDir();
  const write = (name) => {
    const p = path.join(dir, name);
    fs.writeFileSync(p, JSON.stringify({ players: [{ period_total: 13 }] }), "utf8");
    return p;
  };
  const guard = (player, verifyScanStrategy) => ({
    player,
    fetch_status: "used_existing_json_regression_guard",
    csv_status: "used_existing_csv",
    rotation_full_verify: true,
    verify_scan_strategy: verifyScanStrategy,
    json_path: write(`${player}.json`),
  });
  const report = {
    results: [
      // ① 실제로 다 읽었는데 줄었다 → 조용한 삭제 의심, 판정 대상
      guard("정독선수", "full_scan"),
      // ② 수집이 꺼져 관측이 없다 → 판정 제외 (혁민 male:mix:1184 실측 사례)
      guard("혼성선수", "mixed_collection_disabled"),
      // 옛 산출물에는 이 필드가 없다 — 관측을 증명하지 못하므로 안전하게 제외
      {
        player: "구버전선수",
        fetch_status: "used_existing_json_regression_guard",
        csv_status: "used_existing_csv",
        json_path: write("legacy.json"),
      },
    ],
  };

  const row = summarizeTeamFromReport({ univ: "팀", code: "tm" }, report);
  assert.equal(row.verify_mismatch_players, 1);
  assert.equal(row.verify_mismatch_player_names, "정독선수");
});

// 운영자 재수집으로 낮은 값을 새 기준선으로 받은 선수는 경보가 아니라 확인줄이다.
// 아침 보고가 읽을 수 있게 팀 행에 이름+from→to로 실려야 한다.
runTest("summarizeTeamFromReport carries operator rebaselines onto the team row", () => {
  const dir = makeTempReportsDir();
  const write = (name) => {
    const p = path.join(dir, name);
    fs.writeFileSync(p, JSON.stringify({ players: [{ period_total: 398 }] }), "utf8");
    return p;
  };
  const report = {
    results: [
      {
        player: "정소이",
        fetch_status: "ok",
        csv_status: "ok",
        rebaselined: { from: 401, to: 398 },
        json_path: write("soi.json"),
      },
      { player: "b", fetch_status: "ok", csv_status: "ok", json_path: write("b.json") },
    ],
  };

  const row = summarizeTeamFromReport({ univ: "팀", code: "tm" }, report);
  assert.deepEqual(row.rebaselined_players, [{ player: "정소이", from: 401, to: 398 }]);
  // 재기준선은 성공 경로다 — 실패로 세면 안 된다.
  assert.equal(row.fetch_fail, 0);
});

runTest("buildAlerts reports rotation verify mismatches without blocking the sync", () => {
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
        verify_mismatch_players: 1,
        verify_mismatch_player_names: "김설",
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

  const hit = actual.find((row) => row.rule === "rotation_verify_mismatch");
  assert.ok(hit, "전체 정독 결과가 기존보다 적으면 경보로 떠야 한다");
  assert.equal(hit.team_code, "ssg");
  // 서빙 동기화를 막지 않는다(blocking = critical/high).
  assert.equal(hit.severity, "medium");
  assert.match(hit.message, /김설/);
});

runTest("buildAlerts stays quiet when no verify mismatch happened", () => {
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
        verify_mismatch_players: 0,
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

  assert.equal(actual.filter((row) => row.rule === "rotation_verify_mismatch").length, 0);
});

// --- 소스(엘로보드) 장애 -------------------------------------------------------
// 2026-08-13 장애: 사이트가 HTTP 200에 오류 본문을 주고, 일부는 목록만 0행으로 왔다.
// 예전에는 그 0건이 "조용한 삭제 의심"으로 둔갑했다. 이제는 관측 실패로 정직하게 떨어져야 한다.
runTest("summarizeTeamFromReport counts source-outage statuses as fetch failures", () => {
  const dir = makeTempReportsDir();
  const write = (name, periodTotal) => {
    const p = path.join(dir, name);
    fs.writeFileSync(
      p,
      JSON.stringify({ players: [{ period_total: periodTotal, period_wins: 0, period_losses: 0, scan_strategy: "full_scan" }] }),
      "utf8"
    );
    return p;
  };
  const report = {
    results: [
      {
        player: "a",
        fetch_status: "fetch_failed_source_outage",
        csv_status: "failed",
        error: "source_outage: GET https://eloboard.com/...",
        json_path: write("a.json", 12),
      },
      // 회로 차단기로 건너뛴 선수. 기존 json은 그대로 집계돼야 팀 총계가 줄지 않는다.
      {
        player: "b",
        fetch_status: "skipped_source_outage",
        csv_status: "skipped",
        error: "source_outage: 엘로보드 장애로 수집 중단(회로 차단기)",
        json_path: write("b.json", 0),
      },
      { player: "c", fetch_status: "ok", csv_status: "ok", json_path: write("c.json", 5) },
    ],
  };

  const row = summarizeTeamFromReport({ univ: "팀", code: "tm" }, report);
  assert.equal(row.fetch_fail, 2, "두 상태 모두 관측 실패로 집계된다");
  assert.equal(row.source_outage_players, 2);
  assert.equal(row.total_matches, 17, "기존 json 집계는 보존된다(총 경기 수 감소 오탐 방지)");
  // 오늘 읽지도 못한 선수의 옛 0건을 세면 장애 하나가 두 경보로 이중 계상된다.
  assert.equal(row.zero_record_players, 0);
  assert.equal(row.zero_players, "");
  assert.equal(
    row.failures.some((f) => f.player === "b" && String(f.error).includes("source_outage")),
    true,
    "실패 사유가 failures에 남는다"
  );
});

// 새 경보 규칙을 만들지 않는다 — 기존 pipeline_failure 한 줄에 사유만 실린다.
runTest("buildAlerts states the source-site outage inside the existing failure alert", () => {
  const alerts = buildAlerts(
    [
      {
        team: "팀",
        team_code: "tm",
        zero_players: "",
        fetch_fail: 7,
        csv_fail: 7,
        source_outage_players: 7,
        delta_total_matches: 0,
        delta_players: 0,
      },
    ],
    { rules: { pipeline_failure_severity: "critical", no_new_matches_enabled: false } }
  );

  const failureAlerts = alerts.filter((a) => a.rule === "pipeline_failure");
  assert.equal(failureAlerts.length, 1);
  assert.match(failureAlerts[0].message, /소스 사이트 장애/);
  assert.match(failureAlerts[0].message, /7명/);
  assert.equal(alerts.some((a) => a.rule === "zero_record_players"), false);
});
