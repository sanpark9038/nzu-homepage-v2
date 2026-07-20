const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");

const {
  buildLegacyEntityIdsBySuccessor,
  buildExcludedEntityIds,
  buildRetainedFaEntityIds,
  collapseObservedLegacyDuplicates,
  collapseStalePreviousDuplicateEntities,
  effectiveTier,
  effectiveRace,
  findBaselineIdentityMigrationCandidate,
  reconcileObservedIdentityMigrations,
  restoreMissingFaBaselinePlayers,
  shouldWriteRosterFiles,
  shouldPersistTemporaryReleases,
  shouldRetainPreviousAffiliation,
  shouldGuardObservedRoster,
  upsertRosterEntry,
  readJsonIfExists,
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

runTest("collapseStalePreviousDuplicateEntities suppresses stale duplicate ids when one variant remains observed", () => {
  const beforeByEntity = new Map([
    [
      "eloboard:male:913",
      {
        team_code: "black",
        player: {
          entity_id: "eloboard:male:913",
          wr_id: 913,
          gender: "male",
          name: "é®â‰ªì˜±TV",
          display_name: "é®â‰ªì˜±TV",
        },
      },
    ],
    [
      "eloboard:male:mix:913",
      {
        team_code: "black",
        player: {
          entity_id: "eloboard:male:mix:913",
          wr_id: 913,
          gender: "male",
          name: "é®â‰ªì˜±TV",
          display_name: "é®â‰ªì˜±TV",
        },
      },
    ],
  ]);
  const observedByEntity = new Map([
    [
      "eloboard:male:mix:913",
      {
        entity_id: "eloboard:male:mix:913",
        wr_id: 913,
        gender: "male",
        name: "é®â‰ªì˜±TV",
        team_code: "black",
        profile_kind: "mix",
      },
    ],
  ]);

  const actual = collapseStalePreviousDuplicateEntities(beforeByEntity, observedByEntity);

  assert.deepEqual(actual, [
    {
      canonical_entity_id: "eloboard:male:mix:913",
      legacy_entity_id: "eloboard:male:913",
      name: "é®â‰ªì˜±TV",
      team_code: "black",
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

runTest("buildRetainedFaEntityIds drops user-excluded FA players even when observed", () => {
  const observedByEntity = new Map([
    ["eloboard:female:1", { team_code: "fa", name: "Keep" }],
    ["eloboard:female:2", { team_code: "fa", name: "Drop" }],
  ]);

  const actual = buildRetainedFaEntityIds(
    new Set(["eloboard:female:1", "eloboard:female:2"]),
    observedByEntity,
    ["eloboard:female:3"],
    new Set(["eloboard:female:2", "eloboard:female:3"])
  );

  assert.deepEqual([...actual].sort(), ["eloboard:female:1"]);
});

runTest("buildExcludedEntityIds reads explicit excluded entity ids", () => {
  const actual = buildExcludedEntityIds([
    { entity_id: "eloboard:female:1" },
    { entity_id: "" },
    {},
  ]);

  assert.deepEqual([...actual], ["eloboard:female:1"]);
});

runTest("readJsonIfExists returns fallback for missing optional metadata files", () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "roster-sync-json-"));
  const missingPath = path.join(dir, "missing.json");
  const existingPath = path.join(dir, "existing.json");
  fs.writeFileSync(existingPath, JSON.stringify({ players: [{ entity_id: "eloboard:female:1" }] }), "utf8");

  assert.deepEqual(readJsonIfExists(missingPath, { players: [] }), { players: [] });
  assert.deepEqual(readJsonIfExists(existingPath, { players: [] }), {
    players: [{ entity_id: "eloboard:female:1" }],
  });
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

runTest("roster sync writes files only when report-only is not requested", () => {
  assert.equal(shouldWriteRosterFiles(["node", "sync-team-roster-metadata.js"]), true);
  assert.equal(shouldWriteRosterFiles(["node", "sync-team-roster-metadata.js", "--report-only"]), false);
});

runTest("temporary release persistence is independent from roster file writes", () => {
  const base = ["node", "sync-team-roster-metadata.js"];

  // 파일을 쓰는 일반 실행은 해제도 기록한다.
  assert.equal(shouldPersistTemporaryReleases(base), true);
  // report-only 단독은 아무것도 기록하지 않는다(기존 동작 유지).
  assert.equal(shouldPersistTemporaryReleases([...base, "--report-only"]), false);
  // 파이프라인 조합: 파일은 안 쓰지만 해제는 기록한다.
  assert.equal(shouldPersistTemporaryReleases([...base, "--report-only", "--persist-releases"]), true);
  assert.equal(shouldWriteRosterFiles([...base, "--report-only", "--persist-releases"]), false);
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
        entity_id: "eloboard:female:1001",
        wr_id: 1001,
        gender: "female",
        name: "타팀행",
        display_name: "타팀행",
        tier: "7",
        race: "Terran",
      },
    ],
    new Map(),
    new Map([["eloboard:female:1001", { team_code: "black", player: { entity_id: "eloboard:female:1001" } }]]),
    new Set()
  );

  assert.deepEqual(restored, [{ entity_id: "eloboard:female:998", name: "박쭈이" }]);
  assert.equal(faDoc.json.roster.length, 1);
  assert.equal(faDoc.json.roster[0].entity_id, "eloboard:female:998");
  assert.equal(faDoc.json.roster[0].source, "roster_sync_fa_baseline");
});

runTest("fallback FA move rows are intended to be labeled as fallback confidence", () => {
  const moved = [];
  moved.push({
    entity_id: "eloboard:male:913",
    name: "빡재TV",
    from: "black",
    to: "fa",
    change_confidence: "fallback",
  });

  assert.equal(moved[0].change_confidence, "fallback");
});

runTest("shouldRetainPreviousAffiliation keeps prior team when a player disappears from the current scrape", () => {
  const actual = shouldRetainPreviousAffiliation(
    "eloboard:male:913",
    {
      team_code: "black",
      player: {
        entity_id: "eloboard:male:913",
        name: "é®â‰ªì˜±TV",
      },
    },
    new Map(),
    new Set(),
    new Set()
  );

  assert.equal(actual, true);
});

runTest("shouldRetainPreviousAffiliation does not retain when the player is already observed this run", () => {
  const actual = shouldRetainPreviousAffiliation(
    "eloboard:male:913",
    {
      team_code: "black",
      player: {
        entity_id: "eloboard:male:913",
        name: "é®â‰ªì˜±TV",
      },
    },
    new Map([["eloboard:male:913", { team_code: "black" }]]),
    new Set(),
    new Set()
  );

  assert.equal(actual, false);
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
