const assert = require("node:assert/strict");
const fs = require("fs");
const os = require("os");
const path = require("path");

const {
  applyFailureStageToMessage,
  buildAffiliationConfidenceLookup,
  buildCollectionSourceHealthSummary,
  buildDailyReportMessage,
  buildFailureMessage,
  buildJudgmentItems,
  comparePlayerChanges,
  describeFailureStage,
  describeAlertTone,
  formatAffiliationChangeRow,
  partitionAffiliationChanges,
} = require("./send-manual-refresh-discord");
const {
  buildIdentityMigrationLookup,
  buildLegacyEntityIdLookup,
  buildDiscordSummaryCheck,
  buildPlayerKey,
  canonicalEntityId,
  compareRosterJoinersRemovals,
  mergedEntityIdLookup,
  resolveLatestReportFile,
  writeCurrentRosterStateSnapshot,
} = require("./lib/discord-summary");

function runTest(name, fn) {
  try {
    fn();
    console.log(`PASS ${name}`);
  } catch (error) {
    console.error(`FAIL ${name}`);
    throw error;
  }
}

runTest("describeAlertTone treats critical/high as warnings", () => {
  const actual = describeAlertTone({ critical: 0, high: 1, medium: 3, low: 0, total: 4 });
  assert.equal(actual.headlineSuffix, "(경고 포함)");
  assert.equal(actual.summaryLabel, "주의 알림");
  assert.equal(actual.isWarning, true);
});

runTest("describeAlertTone treats medium-only as operational notices", () => {
  const actual = describeAlertTone({ critical: 0, high: 0, medium: 13, low: 0, total: 13 });
  assert.equal(actual.headlineSuffix, "(변동 알림)");
  assert.equal(actual.summaryLabel, "변동 알림");
  assert.match(actual.followup, /전적데이터 반영은 정상 완료/);
  assert.match(actual.followup, /선수 기준데이터 후보는 운영상 검토용/);
  assert.doesNotMatch(actual.followup, /^반영은 정상 완료/);
  assert.equal(actual.isWarning, false);
});

runTest("describeAlertTone stays neutral when no alerts exist", () => {
  const actual = describeAlertTone({ critical: 0, high: 0, medium: 0, low: 0, total: 0 });
  assert.equal(actual.headlineSuffix, "");
  assert.equal(actual.followup, "");
});

runTest("describeFailureStage distinguishes preflight test failures from collection failures", () => {
  const actual = describeFailureStage(
    null,
    {
      failure_step: {
        name: "Run daily pipeline regression tests",
      },
    }
  );

  assert.deepEqual(actual, {
    headline: "사전 검증 단계(회귀 테스트)에서 오류가 발생했습니다.",
    detail: "일일 수집은 시작되기 전에 중단되었습니다.",
  });
});

runTest("describeFailureStage keeps collection and sync failures specific", () => {
  assert.deepEqual(
    describeFailureStage(
      {
        failure_step: {
          name: "collect_chunked",
        },
      },
      null
    ),
    {
      headline: "수집 단계에서 오류가 발생했습니다.",
      detail: "",
    }
  );

  assert.deepEqual(
    describeFailureStage(
      {
        failure_step: {
          name: "supabase_push",
        },
      },
      null
    ),
    {
      headline: "반영 단계에서 오류가 발생했습니다.",
      detail: "",
    }
  );
});

runTest("applyFailureStageToMessage rewrites the generic failure line", () => {
  const actual = applyFailureStageToMessage(
    ["헤더", "", "기존 일반 실패 문구", "실행 링크: test"].join("\n"),
    null,
    {
      failure_step: {
        name: "Run daily pipeline regression tests",
      },
    }
  );

  assert.deepEqual(actual.split("\n").slice(0, 4), [
    "헤더",
    "",
    "사전 검증 단계(회귀 테스트)에서 오류가 발생했습니다.",
    "일일 수집은 시작되기 전에 중단되었습니다.",
  ]);
});

runTest("buildCollectionSourceHealthSummary returns simple ok message", () => {
  const actual = buildCollectionSourceHealthSummary({
    checks: {
      team_index: { ok: true },
      team_roster_page: { ok: true },
      player_profile_page: { ok: true },
      player_paginated_history: { ok: true },
    },
  });
  assert.equal(actual, "수집 경로 확인: 정상");
});

runTest("buildCollectionSourceHealthSummary names failed stages simply", () => {
  const actual = buildCollectionSourceHealthSummary({
    checks: {
      team_index: { ok: true },
      team_roster_page: { ok: false },
      player_profile_page: { ok: false },
      player_paginated_history: { ok: true },
    },
  });
  assert.equal(actual, "수집 경로 확인: 팀 로스터, 선수 프로필 확인 필요");
});

runTest("comparePlayerChanges prioritizes unknown-tier resolution and FA affiliation changes", () => {
  const ordered = comparePlayerChanges(
    [
      { entity_id: "a", name: "Alpha", team_name: "무소속", tier: "미정" },
      { entity_id: "b", name: "Beta", team_name: "A팀", tier: "3티어" },
      { entity_id: "c", name: "Gamma", team_name: "무소속", tier: "2티어" },
      { entity_id: "d", name: "Delta", team_name: "B팀", tier: "4티어" },
    ],
    [
      { entity_id: "a", name: "Alpha", team_name: "무소속", tier: "잭" },
      { entity_id: "b", name: "Beta", team_name: "A팀", tier: "2티어" },
      { entity_id: "c", name: "Gamma", team_name: "C팀", tier: "2티어" },
      { entity_id: "d", name: "Delta", team_name: "E팀", tier: "4티어" },
    ]
  );

  assert.deepEqual(ordered.tierChanges.map((row) => row.player_name), ["Alpha", "Beta"]);
  assert.deepEqual(ordered.affiliationChanges.map((row) => row.player_name), ["Gamma", "Delta"]);
  assert.equal(ordered.affiliationChanges[0].change_confidence, "inferred");
});

runTest("buildAffiliationConfidenceLookup reads fallback confidence from roster sync report", () => {
  const reportsDir = fs.mkdtempSync(path.join(os.tmpdir(), "nzu-discord-confidence-"));
  fs.writeFileSync(
    path.join(reportsDir, "team_roster_sync_report.json"),
    JSON.stringify(
      {
        moved: [
          {
            entity_id: "eloboard:male:913",
            name: "빡재TV",
            from: "black",
            to: "fa",
            change_confidence: "fallback",
          },
        ],
      },
      null,
      2
    )
  );

  const originalReportsDir = path.join(process.cwd(), "tmp", "reports");
  const reportTarget = path.join(originalReportsDir, "team_roster_sync_report.json");
  const prior = fs.existsSync(reportTarget) ? fs.readFileSync(reportTarget, "utf8") : null;
  fs.mkdirSync(originalReportsDir, { recursive: true });
  fs.copyFileSync(path.join(reportsDir, "team_roster_sync_report.json"), reportTarget);

  try {
    const actual = buildAffiliationConfidenceLookup();
    assert.equal(actual.get("entity:eloboard:male:913"), "fallback");
  } finally {
    if (prior === null) {
      fs.unlinkSync(reportTarget);
    } else {
      fs.writeFileSync(reportTarget, prior, "utf8");
    }
  }
});

runTest("formatAffiliationChangeRow avoids definitive wording for fallback and inferred changes", () => {
  assert.equal(
    formatAffiliationChangeRow({
      player_name: "빡재TV",
      old_team: "흑카데미",
      new_team: "무소속",
      change_confidence: "fallback",
    }),
    "- 빡재TV : 소속 미확인, 연속성 보정으로 흑카데미 -> 무소속 처리"
  );

  assert.equal(
    formatAffiliationChangeRow({
      player_name: "감마",
      old_team: "무소속",
      new_team: "C팀",
      change_confidence: "inferred",
    }),
    "- 감마 : 무소속 -> C팀 (관측 기반 추정)"
  );
});

runTest("partitionAffiliationChanges separates fallback rows for dedicated Discord sections", () => {
  const actual = partitionAffiliationChanges([
    {
      player_name: "鍮≪옱TV",
      old_team: "?묒뭅?곕?",
      new_team: "臾댁냼??",
      change_confidence: "fallback",
    },
    {
      player_name: "留먯쭏",
      old_team: "臾댁냼??",
      new_team: "BGM",
      change_confidence: "confirmed",
    },
    {
      player_name: "媛먮쭏",
      old_team: "臾댁냼??",
      new_team: "C?",
      change_confidence: "inferred",
    },
  ]);

  assert.deepEqual(actual.fallback.map((row) => row.player_name), ["鍮≪옱TV"]);
  assert.deepEqual(actual.primary.map((row) => row.player_name), ["留먯쭏", "媛먮쭏"]);
});

runTest("canonicalEntityId collapses legacy ids into the current manual-override id", () => {
  const lookup = buildLegacyEntityIdLookup([
    {
      entity_id: "eloboard:female:1028",
      legacy_entity_ids: ["eloboard:female:1026"],
    },
  ]);

  assert.equal(canonicalEntityId("eloboard:female:1026", lookup), "eloboard:female:1028");
  assert.equal(canonicalEntityId("eloboard:female:1028", lookup), "eloboard:female:1028");
});

runTest("buildPlayerKey treats legacy and successor entity ids as the same Discord summary identity", () => {
  const legacyLookup = buildLegacyEntityIdLookup([
    {
      entity_id: "eloboard:female:1028",
      legacy_entity_ids: ["eloboard:female:1026"],
    },
  ]);

  const baselineKey = buildPlayerKey({ entity_id: "eloboard:female:1026", name: "미진이" }, legacyLookup);
  const currentKey = buildPlayerKey({ entity_id: "eloboard:female:1028", name: "미진이" }, legacyLookup);

  assert.equal(baselineKey, currentKey);
});

runTest("buildIdentityMigrationLookup maps observed runtime ids back to prior baseline ids", () => {
  const lookup = buildIdentityMigrationLookup({
    identity_migrations: [
      {
        previous_entity_id: "eloboard:male:1055",
        observed_entity_id: "eloboard:male:mix:1055",
      },
    ],
  });

  assert.equal(lookup.get("eloboard:male:mix:1055"), "eloboard:male:1055");
});

runTest("mergedEntityIdLookup combines manual legacy ids and runtime identity migrations", () => {
  const reportsDir = fs.mkdtempSync(path.join(os.tmpdir(), "nzu-discord-summary-"));
  fs.writeFileSync(
    path.join(reportsDir, "team_roster_sync_report.json"),
    JSON.stringify(
      {
        identity_migrations: [
          {
            previous_entity_id: "eloboard:male:1055",
            observed_entity_id: "eloboard:male:mix:1055",
          },
        ],
      },
      null,
      2
    )
  );

  const lookup = mergedEntityIdLookup({ reportsDir });

  assert.equal(lookup.get("eloboard:female:1026"), "eloboard:female:1028");
  assert.equal(lookup.get("eloboard:male:mix:1055"), "eloboard:male:1055");
});

runTest("compareRosterJoinersRemovals suppresses runtime identity-migration false removals", () => {
  const lookup = new Map([
    ["eloboard:male:mix:1055", "eloboard:male:1055"],
  ]);

  const actual = compareRosterJoinersRemovals(
    [{ entity_id: "eloboard:male:1055", name: "와이퍼", team_name: "와플대" }],
    [{ entity_id: "eloboard:male:mix:1055", name: "와이퍼", team_name: "와플대" }],
    lookup
  );

  assert.deepEqual(actual, { joiners: [], removals: [] });
});

runTest("compareRosterJoinersRemovals suppresses same-name same-team identity-shape changes", () => {
  const actual = compareRosterJoinersRemovals(
    [{ entity_id: "eloboard:male:671", name: "쌍디", display_name: "쌍디", team_name: "무소속" }],
    [{ entity_id: "eloboard:male:mix:671", name: "쌍디", display_name: "쌍디", team_name: "무소속" }]
  );

  assert.deepEqual(actual, { joiners: [], removals: [] });
});

runTest("buildDiscordSummaryCheck prefers saved roster snapshot over local projects dir", () => {
  const reportsDir = fs.mkdtempSync(path.join(os.tmpdir(), "nzu-discord-summary-snapshot-"));
  const baselinePath = path.join(reportsDir, "manual_refresh_baseline.json");
  fs.writeFileSync(
    baselinePath,
    JSON.stringify(
      {
        teams: [
          {
            team_code: "bgm",
            players: [
              {
                entity_id: "eloboard:male:155",
                name: "강민기",
                display_name: "쿨지지",
                team_name: "BGM",
              },
            ],
          },
        ],
      },
      null,
      2
    )
  );
  writeCurrentRosterStateSnapshot(reportsDir, [
    {
      entity_id: "eloboard:male:155",
      name: "강민기",
      display_name: "쿨지지",
      team_code: "fa",
      team_name: "무소속",
    },
  ]);

  const actual = buildDiscordSummaryCheck({
    reportsDir,
    baselinePath,
    projectsDir: path.join(reportsDir, "missing-projects"),
    snapshot: { teams: [] },
    alertsDoc: { counts: { critical: 0, high: 0, medium: 0, low: 0, total: 0 }, alerts: [] },
  });

  assert.equal(actual.roster_source, "current_roster_state.json");
  assert.deepEqual(actual.removals, []);
});

runTest("buildDiscordSummaryCheck exposes affiliation confidence summary from roster sync", () => {
  const reportsDir = fs.mkdtempSync(path.join(os.tmpdir(), "nzu-discord-affiliation-summary-"));
  const baselinePath = path.join(reportsDir, "manual_refresh_baseline.json");
  fs.writeFileSync(
    baselinePath,
    JSON.stringify(
      {
        teams: [],
      },
      null,
      2
    )
  );
  fs.writeFileSync(
    path.join(reportsDir, "team_roster_sync_report.json"),
    JSON.stringify(
      {
        moved: [
          {
            entity_id: "eloboard:male:913",
            name: "鍮≪옱TV",
            from: "black",
            to: "fa",
            change_confidence: "fallback",
          },
          {
            entity_id: "eloboard:female:177",
            name: "?섏삁由?",
            from: "ssu",
            to: "fa",
            change_confidence: "confirmed",
          },
        ],
      },
      null,
      2
    )
  );

  const actual = buildDiscordSummaryCheck({
    reportsDir,
    baselinePath,
    projectsDir: path.join(reportsDir, "missing-projects"),
    snapshot: { teams: [] },
    alertsDoc: { counts: { critical: 0, high: 0, medium: 0, low: 0, total: 0 }, alerts: [] },
  });

  assert.equal(actual.affiliation_changes.length, 2);
  assert.deepEqual(actual.affiliation_change_summary.counts, {
    confirmed: 1,
    inferred: 0,
    fallback: 1,
    total: 2,
  });
  assert.deepEqual(actual.affiliation_change_summary.by_previous_team, [
    { team_name: "black", count: 1 },
    { team_name: "ssu", count: 1 },
  ]);
});

runTest("buildDiscordSummaryCheck suppresses roster sync changes already present in prior roster state", () => {
  const reportsDir = fs.mkdtempSync(path.join(os.tmpdir(), "nzu-discord-repeat-roster-delta-"));
  const baselinePath = path.join(reportsDir, "manual_refresh_baseline.json");
  fs.writeFileSync(
    baselinePath,
    JSON.stringify(
      {
        teams: [
          {
            team_code: "fa",
            players: [
              {
                entity_id: "eloboard:female:932",
                name: "루다",
                display_name: "루다",
                team_code: "fa",
                team_name: "무소속",
              },
            ],
          },
        ],
      },
      null,
      2
    )
  );
  fs.writeFileSync(
    path.join(reportsDir, "team_roster_sync_report.json"),
    JSON.stringify(
      {
        moved: [
          {
            entity_id: "eloboard:female:932",
            name: "루다",
            from: "fa",
            to: "wfu",
            change_confidence: "confirmed",
          },
          {
            entity_id: "eloboard:male:155",
            name: "강민기",
            from: "fa",
            to: "wfu",
            change_confidence: "confirmed",
          },
        ],
        added: [
          {
            entity_id: "eloboard:male:777",
            name: "이미반영",
            to: "fa",
            change_confidence: "confirmed",
          },
          {
            entity_id: "eloboard:male:888",
            name: "신규선수",
            to: "fa",
            change_confidence: "confirmed",
          },
        ],
      },
      null,
      2
    )
  );

  const actual = buildDiscordSummaryCheck({
    reportsDir,
    baselinePath,
    projectsDir: path.join(reportsDir, "missing-projects"),
    previousRosterStatePlayers: [
      {
        entity_id: "eloboard:female:932",
        name: "루다",
        display_name: "루다",
        team_code: "wfu",
        team_name: "wfu",
      },
      {
        entity_id: "eloboard:male:777",
        name: "이미반영",
        display_name: "이미반영",
        team_code: "fa",
        team_name: "무소속",
      },
    ],
    currentPlayers: [
      {
        entity_id: "eloboard:female:932",
        name: "루다",
        display_name: "루다",
        team_code: "wfu",
        team_name: "wfu",
      },
      {
        entity_id: "eloboard:male:155",
        name: "강민기",
        display_name: "강민기",
        team_code: "wfu",
        team_name: "wfu",
      },
      {
        entity_id: "eloboard:male:777",
        name: "이미반영",
        display_name: "이미반영",
        team_code: "fa",
        team_name: "무소속",
      },
      {
        entity_id: "eloboard:male:888",
        name: "신규선수",
        display_name: "신규선수",
        team_code: "fa",
        team_name: "무소속",
      },
    ],
    snapshot: { teams: [] },
    alertsDoc: { counts: { critical: 0, high: 0, medium: 0, low: 0, total: 0 }, alerts: [] },
  });

  assert.deepEqual(actual.affiliation_changes.map((row) => row.player_name), ["강민기"]);
  assert.deepEqual(actual.joiners.map((row) => row.player_name), ["신규선수"]);
});

runTest("buildDiscordSummaryCheck does not fallback to baseline joiners after suppressing repeated roster sync joiners", () => {
  const reportsDir = fs.mkdtempSync(path.join(os.tmpdir(), "nzu-discord-repeat-joiner-fallback-"));
  const baselinePath = path.join(reportsDir, "manual_refresh_baseline.json");
  fs.writeFileSync(
    baselinePath,
    JSON.stringify(
      {
        teams: [],
      },
      null,
      2
    )
  );
  fs.writeFileSync(
    path.join(reportsDir, "team_roster_sync_report.json"),
    JSON.stringify(
      {
        added: [
          {
            entity_id: "eloboard:male:1001",
            name: "Repeat Alpha",
            to: "fa",
            change_confidence: "confirmed",
          },
          {
            entity_id: "eloboard:female:1002",
            name: "Repeat Beta",
            to: "ku",
            change_confidence: "confirmed",
          },
        ],
      },
      null,
      2
    )
  );

  const previousRosterStatePlayers = [
    {
      entity_id: "eloboard:male:1001",
      name: "Repeat Alpha",
      display_name: "Repeat Alpha",
      team_code: "fa",
      team_name: "fa",
    },
    {
      entity_id: "eloboard:female:1002",
      name: "Repeat Beta",
      display_name: "Repeat Beta",
      team_code: "ku",
      team_name: "ku",
    },
  ];

  const actual = buildDiscordSummaryCheck({
    reportsDir,
    baselinePath,
    projectsDir: path.join(reportsDir, "missing-projects"),
    previousRosterStatePlayers,
    currentPlayers: previousRosterStatePlayers,
    snapshot: { teams: [] },
    alertsDoc: { counts: { critical: 0, high: 0, medium: 0, low: 0, total: 0 }, alerts: [] },
  });

  assert.deepEqual(actual.joiners, []);
  assert.equal(actual.joiners_source, "previous_roster_state");
});

runTest("buildDiscordSummaryCheck suppresses joiners already reviewed as external opponents", () => {
  const reportsDir = fs.mkdtempSync(path.join(os.tmpdir(), "nzu-discord-external-joiner-"));
  const baselinePath = path.join(reportsDir, "manual_refresh_baseline.json");
  fs.writeFileSync(baselinePath, JSON.stringify({ teams: [] }, null, 2));
  fs.writeFileSync(
    path.join(reportsDir, "team_roster_sync_report.json"),
    JSON.stringify(
      {
        added: [
          { entity_id: "eloboard:male:2001", name: "외부인", to: "c9", change_confidence: "confirmed" },
          { entity_id: "eloboard:female:2002", name: "진짜신규", to: "ku", change_confidence: "confirmed" },
        ],
      },
      null,
      2
    )
  );

  const actual = buildDiscordSummaryCheck({
    reportsDir,
    baselinePath,
    projectsDir: path.join(reportsDir, "missing-projects"),
    previousRosterStatePlayers: [],
    currentPlayers: [],
    snapshot: { teams: [] },
    alertsDoc: { counts: { critical: 0, high: 0, medium: 0, low: 0, total: 0 }, alerts: [] },
    externalOpponentNames: new Set(["외부인"]),
  });

  assert.deepEqual(
    actual.joiners.map((row) => row.player_name),
    ["진짜신규"]
  );
});

// §6: 조용한 날에도 보내긴 보낸다. 다만 한 줄이어야 한다.
runTest("판단할 것이 없는 날은 한 줄만 보낸다", () => {
  const message = buildDailyReportMessage({
    dateLabel: "2026-07-28",
    judgmentItems: [],
    runUrl: "https://github.com/nzu/actions/runs/1",
  });

  assert.equal(message.includes("\n"), false);
  assert.match(message, /파이프라인 정상 \(2026-07-28\)/);
  assert.match(message, /판단할 것 없음/);
  assert.match(message, /<https:\/\/github\.com\/nzu\/actions\/runs\/1>/);
});

// §6의 핵심: 매일 뜨는 medium 항목이 사라져야 중요한 게 눈에 띈다.
runTest("판단 항목은 규칙/등급으로 추려지고 매일 뜨는 medium 항목은 빠진다", () => {
  const judgmentItems = buildJudgmentItems({
    alertsDoc: {
      alerts: [
        { rule: "zero_record_players", severity: "high", team: "ku", message: "근거 없는 0건 3명" },
        { rule: "rotation_verify_mismatch", severity: "medium", team: "hm", message: "순환 검증 불일치" },
        { rule: "roster_size_changed", severity: "medium", team: "bgm", message: "로스터 인원 변동" },
      ],
    },
    overrideWatch: {
      newMismatches: [{ name: "알파", reason: "not_on_eloboard", fields: [] }],
      totalMismatches: 2,
      releases: [],
    },
    rosterReview: { reportOnly: false, total: 0 },
    syncWarning: "",
  });

  const message = buildDailyReportMessage({
    dateLabel: "2026-07-28",
    judgmentItems,
    runUrl: "https://github.com/nzu/actions/runs/2",
  });

  assert.match(message, /임시 교정 확인 필요 \(신규 1건 \/ 전체 2건\)/);
  assert.match(message, /근거 없는 0건 \(1건\)/);
  assert.match(message, /순환 검증 mismatch \(1건\)/);
  assert.doesNotMatch(message, /roster_size_changed/);
  assert.doesNotMatch(message, /로스터 인원 변동/);
  assert.match(message, /판단할 것 3건/);
  assert.match(message, /상세: <https:\/\/github\.com\/nzu\/actions\/runs\/2>/);
});

// 간소화는 성공 보고에만 적용된다. 실패 보고 상세는 그대로여야 한다.
runTest("실패 보고는 실패 단계·로그 tail·blocking alerts 상세를 유지한다", () => {
  const reportsDir = path.join(process.cwd(), "tmp", "reports");
  const reportPath = path.join(reportsDir, "manual_refresh_latest.json");
  const prior = fs.existsSync(reportPath) ? fs.readFileSync(reportPath, "utf8") : null;
  const report = {
    generated_at: "2026-07-28T00:10:00+09:00",
    error: "collect_chunked exited with code 1",
    failure_step: { name: "collect_chunked", stderr_tail: ["ETIMEDOUT eloboard.co.kr"] },
  };

  fs.mkdirSync(reportsDir, { recursive: true });
  fs.writeFileSync(reportPath, JSON.stringify(report, null, 2), "utf8");

  try {
    const message = applyFailureStageToMessage(
      buildFailureMessage({
        snapshot: null,
        runUrl: "https://github.com/nzu/actions/runs/3",
        alertsDoc: {
          counts: { critical: 1, high: 1, medium: 0, low: 0, total: 2 },
          alerts: [
            { severity: "critical", team: "ku", rule: "zero_record_players", message: "수집 0건" },
            { severity: "high", team: "hm", rule: "rotation_verify_mismatch", message: "검증 불일치" },
          ],
        },
        opsPipelineReport: null,
      }),
      report,
      null
    );

    assert.match(message, /실패 \(2026-07-28\)/);
    assert.match(message, /수집 단계에서 오류가 발생했습니다\./);
    assert.match(message, /실패 단계: collect_chunked/);
    assert.match(message, /오류 요약: collect_chunked exited with code 1/);
    assert.match(message, /마지막 로그: ETIMEDOUT eloboard\.co\.kr/);
    assert.match(message, /Blocking alerts: 2건 \(critical 1, high 1\)/);
    assert.match(message, /- \[critical\] ku \/ zero_record_players \/ 수집 0건/);
  } finally {
    if (prior === null) {
      fs.unlinkSync(reportPath);
    } else {
      fs.writeFileSync(reportPath, prior, "utf8");
    }
  }
});

runTest("resolveLatestReportFile prefers merged daily snapshot over newer chunk snapshot", () => {
  const reportsDir = fs.mkdtempSync(path.join(os.tmpdir(), "nzu-discord-latest-report-"));
  const mergedPath = path.join(reportsDir, "daily_pipeline_snapshot_2026-04-12.json");
  const chunkPath = path.join(reportsDir, "daily_pipeline_snapshot_2026-04-11_214821-chunk6.json");
  fs.writeFileSync(mergedPath, JSON.stringify({ ok: true }));
  fs.writeFileSync(chunkPath, JSON.stringify({ ok: true }));

  const future = new Date(Date.now() + 10_000);
  fs.utimesSync(chunkPath, future, future);

  assert.equal(resolveLatestReportFile(reportsDir, "daily_pipeline_snapshot_"), mergedPath);
});

runTest("resolveLatestReportFile falls back to latest chunk when merged report is absent", () => {
  const reportsDir = fs.mkdtempSync(path.join(os.tmpdir(), "nzu-discord-latest-chunk-"));
  const olderChunkPath = path.join(reportsDir, "daily_pipeline_alerts_2026-04-11_214821-chunk5.json");
  const newerChunkPath = path.join(reportsDir, "daily_pipeline_alerts_2026-04-11_214821-chunk6.json");
  fs.writeFileSync(olderChunkPath, JSON.stringify({ ok: true }));
  fs.writeFileSync(newerChunkPath, JSON.stringify({ ok: true }));

  const past = new Date(Date.now() - 10_000);
  const future = new Date(Date.now() + 10_000);
  fs.utimesSync(olderChunkPath, past, past);
  fs.utimesSync(newerChunkPath, future, future);

  assert.equal(resolveLatestReportFile(reportsDir, "daily_pipeline_alerts_"), newerChunkPath);
});
