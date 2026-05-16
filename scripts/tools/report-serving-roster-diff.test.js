const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const {
  buildServingRosterDiff,
  identityKey,
  parseArgs,
} = require("./report-serving-roster-diff");

const ROOT = path.join(__dirname, "..", "..");

function runTest(name, fn) {
  try {
    fn();
    console.log(`PASS ${name}`);
  } catch (error) {
    console.error(`FAIL ${name}`);
    throw error;
  }
}

runTest("serving roster diff uses durable gender wr_id identity keys", () => {
  assert.equal(identityKey({ entity_id: "eloboard:female:977", gender: "female" }), "female:977");
  assert.equal(identityKey({ eloboard_id: "eloboard:male:mix:1184" }), "male:1184");
  assert.equal(identityKey({ wr_id: 21, gender: "male" }), "male:21");
});

runTest("serving roster diff classifies added removed changed and unchanged rows", () => {
  const actual = buildServingRosterDiff(
    [
      {
        entity_id: "eloboard:female:1",
        gender: "female",
        name: "same",
        team_name: "A",
        tier: "1",
        race: "Terran",
        soop_user_id: "same-id",
      },
      {
        entity_id: "eloboard:female:2",
        gender: "female",
        name: "moved",
        team_name: "B",
        tier: "2",
        race: "Zerg",
        soop_user_id: "moved-id",
      },
      {
        entity_id: "eloboard:female:3",
        gender: "female",
        name: "new-player",
        team_name: "C",
        tier: "3",
        race: "Protoss",
        soop_user_id: "new-id",
      },
    ],
    [
      {
        eloboard_id: "eloboard:female:1",
        gender: "female",
        name: "same",
        university: "A",
        tier: "1",
        race: "T",
        soop_id: "same-id",
      },
      {
        eloboard_id: "eloboard:female:2",
        gender: "female",
        name: "moved",
        university: "Old",
        tier: "2",
        race: "Z",
        soop_id: "moved-id",
      },
      {
        eloboard_id: "eloboard:female:4",
        gender: "female",
        name: "removed-player",
        university: "D",
        tier: "4",
        race: "P",
        soop_id: "removed-id",
      },
    ]
  );

  assert.equal(actual.counts.added, 1);
  assert.equal(actual.counts.removed, 1);
  assert.equal(actual.counts.changed, 1);
  assert.equal(actual.counts.unchanged, 1);
  assert.deepEqual(actual.changed[0].changed_fields, ["university"]);
});

runTest("serving roster diff does not treat project display aliases as serving name drift", () => {
  const actual = buildServingRosterDiff(
    [
      {
        entity_id: "eloboard:male:21",
        gender: "male",
        name: "source-name",
        display_name: "public-alias",
        team_name: "CALM",
        tier: "god",
        race: "Terran",
        soop_user_id: "same-id",
      },
    ],
    [
      {
        eloboard_id: "eloboard:male:21",
        gender: "male",
        name: "source-name",
        university: "CALM",
        tier: "god",
        race: "T",
        soop_id: "same-id",
      },
    ]
  );

  assert.equal(actual.counts.changed, 0);
  assert.equal(actual.counts.unchanged, 1);
});

runTest("serving roster diff accepts serving names that intentionally use display aliases", () => {
  const actual = buildServingRosterDiff(
    [
      {
        entity_id: "eloboard:male:93",
        gender: "male",
        name: "source-name",
        display_name: "confirmed-alias",
        team_name: "FA",
        tier: "jack",
        race: "Protoss",
        soop_user_id: "same-id",
      },
    ],
    [
      {
        eloboard_id: "eloboard:male:93",
        gender: "male",
        name: "confirmed-alias",
        university: "FA",
        tier: "jack",
        race: "P",
        soop_id: "same-id",
      },
    ]
  );

  assert.equal(actual.counts.changed, 0);
  assert.equal(actual.counts.unchanged, 1);
});

runTest("serving roster diff report script is read-only", () => {
  const source = fs.readFileSync(path.join(ROOT, "scripts", "tools", "report-serving-roster-diff.js"), "utf8");

  assert.doesNotMatch(source, /\.upsert\s*\(/);
  assert.doesNotMatch(source, /\.insert\s*\(/);
  assert.doesNotMatch(source, /\.delete\s*\(/);
  assert.doesNotMatch(source, /\.update\s*\(/);
  assert.match(source, /from\("players"\)\.select/);
});

runTest("serving roster diff supabase mode must be explicit", () => {
  assert.deepEqual(parseArgs([]), { servingJson: "", fromSupabase: false });
  assert.deepEqual(parseArgs(["--from-supabase"]), { servingJson: "", fromSupabase: true });
  assert.deepEqual(parseArgs(["--serving-json=tmp/example.json"]), {
    servingJson: "tmp/example.json",
    fromSupabase: false,
  });
});
