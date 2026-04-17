const assert = require("node:assert/strict");
const fs = require("fs");
const os = require("os");
const path = require("path");

const { buildLowSampleReview } = require("./report-low-sample-players");

function runTest(name, fn) {
  try {
    fn();
    console.log(`PASS ${name}`);
  } catch (error) {
    console.error(`FAIL ${name}`);
    throw error;
  }
}

function writeJson(filePath, value) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, JSON.stringify(value, null, 2) + "\n", "utf8");
}

runTest("buildLowSampleReview dedupes same team/name identities and excludes excluded players", () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "nzu-low-sample-"));
  const projectsDir = path.join(root, "projects");
  const tmpDir = path.join(root, "tmp");
  const exclusionsPath = path.join(root, "pipeline_collection_exclusions.v1.json");

  writeJson(path.join(projectsDir, "ku", "players.ku.v1.json"), {
    team_code: "ku",
    team_name: "케이대",
    roster: [
      {
        team_code: "ku",
        team_name: "케이대",
        entity_id: "eloboard:male:205",
        wr_id: 205,
        gender: "male",
        name: "케이",
        display_name: "케이",
        tier: "8",
      },
      {
        team_code: "ku",
        team_name: "케이대",
        entity_id: "eloboard:male:mix:205",
        wr_id: 205,
        gender: "male",
        name: "케이",
        display_name: "케이",
        tier: "8",
      },
      {
        team_code: "ku",
        team_name: "케이대",
        entity_id: "eloboard:male:999",
        wr_id: 999,
        gender: "male",
        name: "제외선수",
        display_name: "제외선수",
        tier: "1",
      },
    ],
  });

  writeJson(path.join(tmpDir, "케이대_eloboard_male_205_matches.json"), {
    players: [{ period_total: 0 }],
  });
  writeJson(path.join(tmpDir, "케이대_eloboard_male_mix_205_matches.json"), {
    players: [{ period_total: 0 }],
  });
  writeJson(path.join(tmpDir, "케이대_eloboard_male_999_matches.json"), {
    players: [{ period_total: 1 }],
  });

  writeJson(exclusionsPath, {
    players: [{ entity_id: "eloboard:male:999", reason: "user_excluded" }],
  });

  const actual = buildLowSampleReview({
    projectsDir,
    tmpDir,
    exclusionsPath,
    threshold: 3,
    now: new Date("2026-04-17T00:00:00.000Z"),
  });

  assert.equal(actual.total, 1);
  assert.deepEqual(actual.counts, { zero_record: 1 });
  assert.equal(actual.players[0].player_name, "케이");
  assert.deepEqual(actual.players[0].entity_ids, ["eloboard:male:205", "eloboard:male:mix:205"]);
});
