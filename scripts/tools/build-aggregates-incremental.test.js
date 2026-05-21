const assert = require("node:assert/strict");

const {
  applyOpponentIdentityAliases,
  extractSourceMatchFields,
  findEntityForSourceFile,
  isSourceCsvFileName,
  normalizeIdentityLookupName,
  normalizePlayerNameFromFileName,
  parseEntityIdFromSourceFileName,
  recalcPlayerDetailAggForDates,
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

runTest("warehouse opponent identity lookup uses reviewed aliases for known canonical entities", () => {
  const rosterIndex = {
    byEntityId: new Map([
      ["eloboard:male:93", { entity_id: "eloboard:male:93", name: "프발", display_name: "프발" }],
    ]),
    byOpponentName: new Map([
      ["프발", new Set(["eloboard:male:93"])],
    ]),
  };

  applyOpponentIdentityAliases(rosterIndex, [
    { entity_id: "eloboard:male:93", aliases: ["이광용"] },
    { entity_id: "eloboard:missing:1", aliases: ["ignored"] },
  ]);

  assert.equal(resolveOpponentEntityId("이광용", rosterIndex), "eloboard:male:93");
  assert.equal(resolveOpponentEntityId("ignored", rosterIndex), "");
});

runTest("warehouse player detail aggregate rolls up map race and opponent breakdowns by date", () => {
  const rows = recalcPlayerDetailAggForDates(
    [
      {
        match_date: "2026-05-20",
        player_entity_id: "player:1",
        player_name: "Alpha",
        team: "HM",
        opponent_name: "Beta",
        opponent_race: "P",
        map_name: "Polypoid",
        is_win: "true",
      },
      {
        match_date: "2026-05-20",
        player_entity_id: "player:1",
        player_name: "Alpha",
        team: "HM",
        opponent_name: "Beta",
        opponent_race: "P",
        map_name: "Polypoid",
        is_win: "false",
      },
    ],
    ["2026-05-20"],
    [
      {
        match_date: "2026-05-19",
        player_entity_id: "player:1",
        player_name: "Alpha",
        team: "HM",
        breakdown_type: "map",
        breakdown_value: "Eclipse",
        matches: "1",
        wins: "1",
        losses: "0",
        win_rate: "100.00",
      },
    ]
  );

  assert.deepEqual(
    rows.filter((row) => row.match_date === "2026-05-20"),
    [
      {
        match_date: "2026-05-20",
        player_entity_id: "player:1",
        player_name: "Alpha",
        team: "HM",
        breakdown_type: "map",
        breakdown_value: "Polypoid",
        matches: "2",
        wins: "1",
        losses: "1",
        win_rate: "50.00",
      },
      {
        match_date: "2026-05-20",
        player_entity_id: "player:1",
        player_name: "Alpha",
        team: "HM",
        breakdown_type: "opponent",
        breakdown_value: "Beta",
        matches: "2",
        wins: "1",
        losses: "1",
        win_rate: "50.00",
      },
      {
        match_date: "2026-05-20",
        player_entity_id: "player:1",
        player_name: "Alpha",
        team: "HM",
        breakdown_type: "opponent_race",
        breakdown_value: "P",
        matches: "2",
        wins: "1",
        losses: "1",
        win_rate: "50.00",
      },
    ]
  );
  assert.equal(rows.some((row) => row.match_date === "2026-05-19"), true);
});
