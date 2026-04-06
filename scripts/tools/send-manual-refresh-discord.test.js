const assert = require("node:assert/strict");
const fs = require("fs");
const os = require("os");
const path = require("path");

const { describeAlertTone } = require("./send-manual-refresh-discord");
const {
  buildIdentityMigrationLookup,
  buildLegacyEntityIdLookup,
  buildDiscordSummaryCheck,
  buildPlayerKey,
  canonicalEntityId,
  compareRosterJoinersRemovals,
  mergedEntityIdLookup,
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
  assert.equal(actual.isWarning, false);
});

runTest("describeAlertTone stays neutral when no alerts exist", () => {
  const actual = describeAlertTone({ critical: 0, high: 0, medium: 0, low: 0, total: 0 });
  assert.equal(actual.headlineSuffix, "");
  assert.equal(actual.followup, "");
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
