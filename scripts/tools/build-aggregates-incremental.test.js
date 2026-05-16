const assert = require("node:assert/strict");

const {
  extractSourceMatchFields,
  findEntityForSourceFile,
  isSourceCsvFileName,
  normalizeIdentityLookupName,
  normalizePlayerNameFromFileName,
  parseEntityIdFromSourceFileName,
  resolveOpponentEntityId,
  sourceCandidateBucketKey,
} = require("./build-aggregates-incremental");

function runTest(name, fn) {
  try {
    fn();
    console.log(`PASS ${name}`);
  } catch (error) {
    console.error(`FAIL ${name}`);
    throw error;
  }
}

runTest("warehouse source detection accepts current exported match CSV names", () => {
  assert.equal(isSourceCsvFileName("eloboard_female_331_player_matches.csv"), true);
  assert.equal(isSourceCsvFileName("eloboard_male_8_player_matches.csv"), true);
  assert.equal(isSourceCsvFileName("eloboard_male_mix_304_player_matches.csv"), true);
});

runTest("warehouse source parsing derives durable eloboard identity from filename", () => {
  assert.equal(parseEntityIdFromSourceFileName("eloboard_female_331_player_matches.csv"), "eloboard:female:331");
  assert.equal(parseEntityIdFromSourceFileName("eloboard_male_8_player_matches.csv"), "eloboard:male:8");
  assert.equal(parseEntityIdFromSourceFileName("eloboard_male_mix_304_player_matches.csv"), "eloboard:male:mix:304");
});

runTest("warehouse player name cleanup removes current match CSV suffix", () => {
  assert.equal(normalizePlayerNameFromFileName("eloboard_female_331_player_matches.csv"), "player");
});

runTest("warehouse source lookup prefers durable identity over display name", () => {
  const byName = new Map([["wrong name", { entity_id: "eloboard:female:999" }]]);
  const byEntityId = new Map([["eloboard:female:331", { entity_id: "eloboard:female:331", name: "right" }]]);

  assert.deepEqual(
    findEntityForSourceFile("eloboard_female_331_wrong name_matches.csv", { byName, byEntityId }),
    { entity_id: "eloboard:female:331", name: "right" }
  );
});

runTest("warehouse source candidate grouping uses durable identity when available", () => {
  assert.equal(sourceCandidateBucketKey({ player: "old name", identity: "eloboard:male:79" }), "eloboard:male:79");
  assert.equal(sourceCandidateBucketKey({ player: "name only", identity: "" }), "name only");
});

runTest("warehouse source row parser accepts current normalized CSV headers", () => {
  assert.deepEqual(
    extractSourceMatchFields({
      date: "2026-05-12",
      opponent_name: "opponent",
      opponent_race: "Z",
      map: "Polypoid",
      result: "loss",
      note: "3/2",
    }),
    {
      matchDate: "2026-05-12",
      opponentName: "opponent",
      opponentRace: "Z",
      mapName: "Polypoid",
      result: "loss",
      memo: "3/2",
      isWin: false,
    }
  );

  assert.equal(extractSourceMatchFields({ date: "2026-05-12", result: "win" }).isWin, true);
});

runTest("warehouse opponent identity lookup normalizes spacing and case", () => {
  assert.equal(normalizeIdentityLookupName(" Opponent A "), "opponenta");
  assert.equal(normalizeIdentityLookupName("Opponent  A"), "opponenta");
});

runTest("warehouse opponent identity lookup resolves only unique canonical names", () => {
  const rosterIndex = {
    byOpponentName: new Map([
      ["opponenta", new Set(["eloboard:female:1"])],
      ["sharedname", new Set(["eloboard:female:2", "eloboard:male:3"])],
    ]),
  };

  assert.equal(resolveOpponentEntityId("Opponent A", rosterIndex), "eloboard:female:1");
  assert.equal(resolveOpponentEntityId("shared name", rosterIndex), "");
  assert.equal(resolveOpponentEntityId("unknown", rosterIndex), "");
});
