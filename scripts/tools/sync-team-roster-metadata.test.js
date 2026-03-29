const assert = require("node:assert/strict");

const {
  effectiveTier,
  effectiveRace,
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
