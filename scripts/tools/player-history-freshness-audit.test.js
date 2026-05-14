const assert = require("node:assert/strict");

const {
  auditCandidates,
  buildCandidateFromPlayer,
  buildExclusionMatchers,
  buildSourceReportArgs,
  compareFreshness,
  filterCandidates,
  findExclusionMatch,
  filterVisibleCandidates,
  latestServingHistoryDate,
  parseEntityId,
  parseSourceLatestDate,
  summarizeRows,
} = require("./audit-player-history-freshness");

const tests = [];

function runTest(name, fn) {
  tests.push({ name, fn });
}

async function runAllTests() {
  for (const { name, fn } of tests) {
  try {
      await fn();
    console.log(`PASS ${name}`);
  } catch (error) {
    console.error(`FAIL ${name}`);
    throw error;
  }
  }
}

runTest("entity ids become durable serving keys", () => {
  assert.deepEqual(parseEntityId("eloboard:male:37"), {
    gender: "male",
    wr_id: 37,
    serving_identity_key: "male:37",
    eloboard_id: "eloboard:male:37",
  });
  assert.equal(parseEntityId("name-only"), null);
});

runTest("project metadata player becomes a source-check candidate", () => {
  const candidate = buildCandidateFromPlayer(
    {
      entity_id: "eloboard:female:901",
      wr_id: 901,
      gender: "female",
      name: "Player A",
      team_code: "fa",
      tier: "8",
      last_match_at: "2026-04-21T00:00:00.000Z",
      check_priority: "high",
    },
    { team_code: "fallback" }
  );

  assert.equal(candidate.serving_identity_key, "female:901");
  assert.equal(candidate.profile_url, "https://eloboard.com/women/bbs/board.php?bo_table=bj_list&wr_id=901");
  assert.equal(candidate.metadata_last_match_at, "2026-04-21");
  assert.equal(candidate.check_priority, "high");
});

runTest("source report args force a no-cache single-player read", () => {
  const candidate = buildCandidateFromPlayer({
    entity_id: "eloboard:male:37",
    wr_id: 37,
    gender: "male",
    name: "Kim Taek Yong",
    team_code: "c9",
    tier: "god",
  });
  const args = buildSourceReportArgs(candidate);

  assert.ok(args.includes("--no-cache"));
  assert.ok(args.includes("--json-only"));
  assert.ok(args.includes("--include-matches"));
  assert.ok(args.includes("https://eloboard.com/men/bbs/board.php?bo_table=bj_list&wr_id=37"));
});

runTest("candidate filtering defaults to bounded priority order", () => {
  const candidates = [
    { serving_identity_key: "male:2", check_priority: "normal", metadata_last_match_at: "2026-05-01" },
    { serving_identity_key: "male:1", check_priority: "high", metadata_last_match_at: "2026-04-01" },
  ];
  const rows = filterCandidates(candidates, { limit: 1 });

  assert.equal(rows.length, 1);
  assert.equal(rows[0].serving_identity_key, "male:1");
});

runTest("source latest date and serving latest date are comparable", () => {
  assert.equal(parseSourceLatestDate({ players: [{ period_max_date: "2026-05-14" }] }), "2026-05-14");
  assert.equal(
    latestServingHistoryDate({
      last_match_at: "2026-05-13T00:00:00+00:00",
      match_history: [{ match_date: "2026-05-12" }, { match_date: "2026-05-14" }],
    }),
    "2026-05-14"
  );
});

runTest("freshness comparison identifies stale serving history", () => {
  assert.deepEqual(compareFreshness({ sourceLatestDate: "2026-05-14", servingLatestDate: "2026-04-20" }), {
    ok: false,
    status: "serving_older_than_source",
  });
  assert.deepEqual(compareFreshness({ sourceLatestDate: "2026-05-14", servingLatestDate: "2026-05-14" }), {
    ok: true,
    status: "fresh",
  });
});

runTest("audit rows explain whether source, serving, or read failed", async () => {
  const candidates = [
    buildCandidateFromPlayer({ entity_id: "eloboard:male:37", wr_id: 37, gender: "male", name: "A", team_code: "c9" }),
    buildCandidateFromPlayer({ entity_id: "eloboard:male:38", wr_id: 38, gender: "male", name: "B", team_code: "c9" }),
    buildCandidateFromPlayer({ entity_id: "eloboard:male:39", wr_id: 39, gender: "male", name: "C", team_code: "c9" }),
  ];
  const rows = await auditCandidates({
    candidates,
    servingRows: [
      {
        serving_identity_key: "male:37",
        eloboard_id: "eloboard:male:37",
        last_match_at: "2026-04-20T00:00:00+00:00",
        match_history: [{ match_date: "2026-04-20" }],
      },
      {
        serving_identity_key: "male:38",
        eloboard_id: "eloboard:male:38",
        last_match_at: "2026-05-14T00:00:00+00:00",
        match_history: [{ match_date: "2026-05-14" }],
      },
    ],
    readSource: (candidate) => {
      if (candidate.serving_identity_key === "male:39") throw new Error("source unavailable");
      return { players: [{ period_max_date: "2026-05-14" }] };
    },
  });

  assert.equal(rows[0].status, "serving_older_than_source");
  assert.equal(rows[1].status, "fresh");
  assert.equal(rows[2].status, "serving_row_missing");
  assert.deepEqual(summarizeRows(rows).counts_by_status, {
    serving_older_than_source: 1,
    fresh: 1,
    serving_row_missing: 1,
  });
});

runTest("no-source mode still fails missing serving rows", async () => {
  const rows = await auditCandidates({
    includeSource: false,
    candidates: [
      buildCandidateFromPlayer({ entity_id: "eloboard:male:37", wr_id: 37, gender: "male", name: "A", team_code: "c9" }),
      buildCandidateFromPlayer({ entity_id: "eloboard:male:38", wr_id: 38, gender: "male", name: "B", team_code: "c9" }),
    ],
    servingRows: [
      {
        serving_identity_key: "male:37",
        eloboard_id: "eloboard:male:37",
        last_match_at: "2026-05-14T00:00:00+00:00",
        match_history: [],
      },
    ],
  });

  assert.equal(rows[0].status, "source_not_checked");
  assert.equal(rows[0].ok, true);
  assert.equal(rows[1].status, "serving_row_missing");
  assert.equal(rows[1].ok, false);
});

runTest("excluded candidates are explained instead of reported as missing serving rows", async () => {
  const candidate = buildCandidateFromPlayer({
    entity_id: "eloboard:male:118",
    wr_id: 118,
    gender: "male",
    name: "A",
    team_code: "fa",
  });
  const exclusionMatchers = buildExclusionMatchers([
    { entity_id: "eloboard:male:118", wr_id: 118, reason: "user_excluded" },
  ]);

  assert.deepEqual(findExclusionMatch(candidate, exclusionMatchers), {
    entity_id: "eloboard:male:118",
    wr_id: 118,
    name: null,
    reason: "user_excluded",
  });

  const rows = await auditCandidates({
    includeSource: false,
    candidates: [candidate],
    servingRows: [],
    exclusionMatchers,
  });

  assert.equal(rows[0].status, "excluded_from_serving");
  assert.equal(rows[0].ok, true);
  assert.equal(rows[0].exclusion_reason, "user_excluded");
});

runTest("excluded candidates still present in serving are flagged", async () => {
  const candidate = buildCandidateFromPlayer({
    entity_id: "eloboard:male:777",
    wr_id: 777,
    gender: "male",
    name: "A",
    team_code: "fa",
  });
  const rows = await auditCandidates({
    includeSource: false,
    candidates: [candidate],
    servingRows: [
      {
        serving_identity_key: "male:777",
        eloboard_id: "eloboard:male:777",
        last_match_at: "2026-04-23T00:00:00+00:00",
        match_history: [],
      },
    ],
    exclusionMatchers: buildExclusionMatchers([
      { entity_id: "eloboard:male:777", wr_id: 777, reason: "user_excluded_pending_tier" },
    ]),
  });

  assert.equal(rows[0].status, "excluded_present_in_serving");
  assert.equal(rows[0].ok, false);
});

runTest("entity-specific exclusions do not fall through to same wr id with different gender", () => {
  const candidate = buildCandidateFromPlayer({
    entity_id: "eloboard:female:777",
    wr_id: 777,
    gender: "female",
    name: "A",
    team_code: "c9",
  });
  const exclusionMatchers = buildExclusionMatchers([
    { entity_id: "eloboard:male:777", wr_id: 777, name: "A", reason: "male_profile_excluded" },
  ]);

  assert.equal(findExclusionMatch(candidate, exclusionMatchers), null);
});

runTest("visible-only candidate filtering removes excluded rows before limiting", () => {
  const excluded = buildCandidateFromPlayer({
    entity_id: "eloboard:male:118",
    wr_id: 118,
    gender: "male",
    name: "Excluded",
    team_code: "fa",
  });
  const visible = buildCandidateFromPlayer({
    entity_id: "eloboard:male:37",
    wr_id: 37,
    gender: "male",
    name: "Visible",
    team_code: "c9",
  });
  const rows = filterVisibleCandidates([excluded, visible], buildExclusionMatchers([
    { entity_id: "eloboard:male:118", wr_id: 118, reason: "user_excluded" },
  ]));

  assert.deepEqual(rows.map((row) => row.serving_identity_key), ["male:37"]);
});

runAllTests();
