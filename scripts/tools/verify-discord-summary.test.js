const assert = require("node:assert/strict");

const {
  buildAffiliationChangeCheck,
  buildHarnessViolations,
} = require("./verify-discord-summary");

function runTest(name, fn) {
  try {
    fn();
    console.log(`PASS ${name}`);
  } catch (error) {
    console.error(`FAIL ${name}`);
    throw error;
  }
}

runTest("buildHarnessViolations accepts safe fallback and inferred wording contracts", () => {
  const actual = buildHarnessViolations([
    {
      player_name: "빡재TV",
      old_team: "흑카데미",
      new_team: "무소속",
      change_confidence: "fallback",
    },
    {
      player_name: "감마",
      old_team: "무소속",
      new_team: "C팀",
      change_confidence: "inferred",
    },
  ]);

  assert.deepEqual(actual, []);
});

runTest("buildHarnessViolations rejects missing or invalid confidence values", () => {
  const actual = buildHarnessViolations([
    {
      player_name: "알파",
      old_team: "A팀",
      new_team: "B팀",
    },
    {
      player_name: "베타",
      old_team: "A팀",
      new_team: "B팀",
      change_confidence: "bad",
    },
  ]);

  assert.equal(actual.length, 2);
  assert.equal(actual[0].code, "missing_change_confidence");
  assert.equal(actual[1].code, "invalid_change_confidence");
});

runTest("buildAffiliationChangeCheck surfaces fallback affiliation changes from current roster snapshot", () => {
  const fs = require("fs");
  const os = require("os");
  const path = require("path");
  const { writeCurrentRosterStateSnapshot } = require("./lib/discord-summary");

  const reportsDir = fs.mkdtempSync(path.join(os.tmpdir(), "nzu-verify-discord-"));
  const baselinePath = path.join(reportsDir, "manual_refresh_baseline.json");
  fs.writeFileSync(
    baselinePath,
    JSON.stringify(
      {
        teams: [
          {
            team_code: "black",
            players: [
              {
                entity_id: "eloboard:male:913",
                name: "빡재TV",
                display_name: "빡재TV",
                team_code: "black",
                team_name: "흑카데미",
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
  writeCurrentRosterStateSnapshot(reportsDir, [
    {
      entity_id: "eloboard:male:913",
      name: "빡재TV",
      display_name: "빡재TV",
      team_code: "fa",
      team_name: "무소속",
    },
  ]);

  const actual = buildAffiliationChangeCheck({
    reportsDir,
    baselinePath,
    projectsDir: path.join(reportsDir, "missing-projects"),
  });

  assert.equal(actual.roster_source, "current_roster_state.json");
  assert.equal(actual.affiliation_changes.length, 1);
  assert.equal(actual.affiliation_changes[0].change_confidence, "fallback");
  assert.deepEqual(actual.harness_violations, []);
});
