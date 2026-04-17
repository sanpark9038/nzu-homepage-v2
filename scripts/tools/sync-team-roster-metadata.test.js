const assert = require("node:assert/strict");

const {
  buildLegacyEntityIdsBySuccessor,
  buildRetainedFaEntityIds,
  collapseObservedLegacyDuplicates,
  effectiveTier,
  effectiveRace,
  findBaselineIdentityMigrationCandidate,
  reconcileObservedIdentityMigrations,
  restoreMissingFaBaselinePlayers,
  shouldGuardObservedRoster,
  upsertRosterEntry,
} = require("./sync-team-roster-metadata");

function runTest(name, fn) {
  try {
    fn();
    console.log(`PASS ${name}`);
  } catch (error) {
    console.error(`FAIL ${name}`);
    throw error;
  }
}

runTest("effectiveTier preserves prior confirmed tier when observed tier is 미정", () => {
  assert.equal(effectiveTier("미정", "8"), "8");
  assert.equal(effectiveTier("", "킹"), "킹");
  assert.equal(effectiveTier("3", "8"), "3");
});

runTest("collapseObservedLegacyDuplicates removes manual legacy duplicates when both ids are observed", () => {
  const observedByEntity = new Map([
    [
      "eloboard:male:205",
      {
        entity_id: "eloboard:male:205",
        wr_id: 205,
        gender: "male",
        name: "케이",
        team_code: "ku",
      },
    ],
    [
      "eloboard:male:mix:205",
      {
        entity_id: "eloboard:male:mix:205",
        wr_id: 205,
        gender: "male",
        name: "케이",
        team_code: "ku",
        profile_kind: "mix",
      },
    ],
  ]);

  const actual = collapseObservedLegacyDuplicates(
    observedByEntity,
    new Map([["eloboard:male:205", ["eloboard:male:mix:205"]]])
  );

  assert.equal(actual.observedByEntity.has("eloboard:male:205"), true);
  assert.equal(actual.observedByEntity.has("eloboard:male:mix:205"), false);
  assert.deepEqual(actual.deduped, [
    {
      canonical_entity_id: "eloboard:male:205",
      legacy_entity_id: "eloboard:male:mix:205",
      name: "케이",
      team_code: "ku",
    },
  ]);
});

runTest("effectiveRace preserves prior confirmed race when observed race is Unknown", () => {
  assert.equal(effectiveRace("Unknown", "Protoss"), "Protoss");
  assert.equal(effectiveRace("", "Zerg"), "Zerg");
  assert.equal(effectiveRace("Terran", "Protoss"), "Terran");
});

runTest("upsertRosterEntry keeps prior tier and race when observed values are unresolved", () => {
  const teamJson = {
    team_name: "무소속",
    team_code: "fa",
    team_name_en: "FA",
    roster: [
      {
        entity_id: "eloboard:female:998",
        name: "박쭈이",
        team_code: "fa",
        team_name: "무소속",
        tier: "8",
        race: "Zerg",
        source: "roster_sync",
      },
    ],
  };

  upsertRosterEntry(
    teamJson,
    {
      entity_id: "eloboard:female:998",
      wr_id: 998,
      gender: "female",
      name: "박쭈이",
      tier: "미정",
      race: "Unknown",
    },
    "roster_sync"
  );

  assert.equal(teamJson.roster[0].tier, "8");
  assert.equal(teamJson.roster[0].race, "Zerg");
});

runTest("buildRetainedFaEntityIds keeps observed FA, manual override FA, and fallback FA players", () => {
  const observedByEntity = new Map([
    ["eloboard:female:1", { team_code: "fa", name: "관측 FA" }],
    ["eloboard:female:2", { team_code: "black", name: "타팀 유지" }],
    ["eloboard:female:3", { team_code: "fa", name: "수동 오버라이드 FA" }],
  ]);

  const actual = buildRetainedFaEntityIds(
    new Set(["eloboard:female:1"]),
    observedByEntity,
    ["eloboard:female:4"]
  );

  assert.deepEqual([...actual].sort(), [
    "eloboard:female:1",
    "eloboard:female:3",
    "eloboard:female:4",
  ]);
});

runTest("buildLegacyEntityIdsBySuccessor maps current entity ids to deprecated predecessors", () => {
  const actual = buildLegacyEntityIdsBySuccessor([
    {
      entity_id: "eloboard:female:1028",
      legacy_entity_ids: ["eloboard:female:1026"],
    },
    {
      entity_id: "eloboard:male:159",
    },
  ]);

  assert.deepEqual([...actual.entries()], [
    ["eloboard:female:1028", ["eloboard:female:1026"]],
  ]);
});

runTest("shouldGuardObservedRoster blocks suspicious partial roster collapses", () => {
  assert.deepEqual(shouldGuardObservedRoster(91, 25), {
    guarded: true,
    reason: "suspicious_drop",
  });
  assert.deepEqual(shouldGuardObservedRoster(20, 0), {
    guarded: true,
    reason: "empty_observed",
  });
  assert.deepEqual(shouldGuardObservedRoster(16, 16), {
    guarded: false,
    reason: "",
  });
});

runTest("restoreMissingFaBaselinePlayers rehydrates FA players missing from current docs", () => {
  const faDoc = {
    json: {
      team_name: "무소속",
      team_code: "fa",
      team_name_en: "FA",
      roster: [],
    },
  };
  const restored = restoreMissingFaBaselinePlayers(
    faDoc,
    [
      {
        entity_id: "eloboard:female:998",
        wr_id: 998,
        gender: "female",
        name: "박쭈이",
        display_name: "박쭈이",
        tier: "8",
        race: "Zerg",
        profile_url: "https://example.com/998",
      },
      {
        entity_id: "eloboard:female:999",
        wr_id: 999,
        gender: "female",
        name: "타팀행",
        display_name: "타팀행",
        tier: "7",
        race: "Terran",
      },
    ],
    new Map(),
    new Map([["eloboard:female:999", { team_code: "black", player: { entity_id: "eloboard:female:999" } }]]),
    new Set()
  );

  assert.deepEqual(restored, [{ entity_id: "eloboard:female:998", name: "박쭈이" }]);
  assert.equal(faDoc.json.roster.length, 1);
  assert.equal(faDoc.json.roster[0].entity_id, "eloboard:female:998");
  assert.equal(faDoc.json.roster[0].source, "roster_sync_fa_baseline");
});

runTest("findBaselineIdentityMigrationCandidate matches same-team same-player profile-kind migrations", () => {
  const beforeByEntity = new Map([
    [
      "eloboard:male:1055",
      {
        team_code: "wfu",
        player: {
          entity_id: "eloboard:male:1055",
          wr_id: 1055,
          gender: "male",
          name: "와이퍼",
          display_name: "와이퍼",
        },
      },
    ],
  ]);

  const actual = findBaselineIdentityMigrationCandidate(beforeByEntity, {
    entity_id: "eloboard:male:mix:1055",
    wr_id: 1055,
    gender: "male",
    name: "와이퍼",
    team_code: "wfu",
  });

  assert.deepEqual(actual, {
    entity_id: "eloboard:male:1055",
    prev: {
      team_code: "wfu",
      player: {
        entity_id: "eloboard:male:1055",
        wr_id: 1055,
        gender: "male",
        name: "와이퍼",
        display_name: "와이퍼",
      },
    },
  });
});

runTest("reconcileObservedIdentityMigrations preserves baseline entity ids for profile-kind-only changes", () => {
  const observedByEntity = new Map([
    [
      "eloboard:male:mix:1055",
      {
        entity_id: "eloboard:male:mix:1055",
        wr_id: 1055,
        gender: "male",
        name: "와이퍼",
        team_code: "wfu",
        profile_kind: "mix",
      },
    ],
  ]);
  const beforeByEntity = new Map([
    [
      "eloboard:male:1055",
      {
        team_code: "wfu",
        player: {
          entity_id: "eloboard:male:1055",
          wr_id: 1055,
          gender: "male",
          name: "와이퍼",
          display_name: "와이퍼",
        },
      },
    ],
  ]);

  const actual = reconcileObservedIdentityMigrations(observedByEntity, beforeByEntity);

  assert.equal(actual.observedByEntity.has("eloboard:male:1055"), true);
  assert.equal(actual.observedByEntity.has("eloboard:male:mix:1055"), false);
  assert.deepEqual(actual.migrations, [
    {
      name: "와이퍼",
      team_code: "wfu",
      previous_entity_id: "eloboard:male:1055",
      observed_entity_id: "eloboard:male:mix:1055",
    },
  ]);
});
