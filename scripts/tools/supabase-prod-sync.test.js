const fs = require("fs");
const path = require("path");
const assert = require("node:assert/strict");

const ROOT = path.join(__dirname, "..", "..");
const TMP_DIR = path.join(ROOT, "tmp");

const {
  buildSyncIdentityKey,
  buildServingStatsByIdentity,
  buildServingStatsByName,
  findProductionIdentityConflicts,
  selectStaleProductionRows,
  findUnsafeStaleDeleteRows,
  buildServingPayload,
  resolveSoopServingMetadata,
  parseMatchHistoryFromStableCsv,
} = require("./supabase-prod-sync");

function runTest(name, fn) {
  try {
    fn();
    console.log(`PASS ${name}`);
  } catch (error) {
    console.error(`FAIL ${name}`);
    throw error;
  }
}

function writeStableCsv(fileName, rows) {
  fs.mkdirSync(TMP_DIR, { recursive: true });
  const filePath = path.join(TMP_DIR, fileName);
  const header = ["날짜", "상대명", "상대종족", "맵", "경기결과(승/패)", "메모"];
  const lines = [header.join(","), ...rows.map((row) => row.join(","))];
  fs.writeFileSync(filePath, "\uFEFF" + lines.join("\n"), "utf8");
  return filePath;
}

runTest("parseMatchHistoryFromStableCsv preserves same-day row order from stable csv", () => {
  const fileName = "__test__stable_order.csv";
  try {
    writeStableCsv(fileName, [
      ["2026-03-05", "opponent-p", "P", "map-alpha", "승", "5/3(4)"],
      ["2026-03-02", "opponent-z", "Z", "map-beta", "패", "older-note"],
      ["2026-03-01", "opponent-t", "T", "map-beta", "패", "older-note-2"],
      ["2026-03-01", "same-day", "T", "map-beta", "승", "3/2(3)"],
      ["2026-03-01", "same-day", "T", "map-gamma", "패", "3/2(2)"],
      ["2026-03-01", "same-day", "T", "map-delta", "승", "3/2(1)"],
    ]);

    const actual = parseMatchHistoryFromStableCsv(fileName);
    assert.deepEqual(
      actual.filter((row) => row.match_date === "2026-03-01").map((row) => `${row.opponent_name}|${row.map_name}|${row.note}`),
      [
        "opponent-t|map-beta|older-note-2",
        "same-day|map-beta|3/2(3)",
        "same-day|map-gamma|3/2(2)",
        "same-day|map-delta|3/2(1)",
      ]
    );
  } finally {
    try {
      fs.unlinkSync(path.join(TMP_DIR, fileName));
    } catch {}
  }
});

runTest("parseMatchHistoryFromStableCsv keeps multiline notes in a single record", () => {
  const fileName = "__test__stable_multiline.csv";
  try {
    writeStableCsv(fileName, [
      ["2026-02-19", "opponent-z", "Z", "map-alpha", "승", "\"line one\nline two\""],
      ["2026-02-19", "opponent-z", "Z", "map-beta", "패", "single-line"],
    ]);

    const actual = parseMatchHistoryFromStableCsv(fileName);
    assert.equal(actual.length, 2);
    assert.deepEqual(
      actual.map((row) => ({
        match_date: row.match_date,
        opponent_name: row.opponent_name,
        map_name: row.map_name,
        note: row.note,
      })),
      [
        {
          match_date: "2026-02-19",
          opponent_name: "opponent-z",
          map_name: "map-alpha",
          note: "line one\nline two",
        },
        {
          match_date: "2026-02-19",
          opponent_name: "opponent-z",
          map_name: "map-beta",
          note: "single-line",
        },
      ]
    );
  } finally {
    try {
      fs.unlinkSync(path.join(TMP_DIR, fileName));
    } catch {}
  }
});

runTest("buildServingStatsByName seeds players from stable csv even when fact rows are missing", () => {
  const fileName = "eloboard_male_99999___stable_only_player__.csv";
  try {
    writeStableCsv(fileName, [
      ["2026-04-10", "opponent-a", "T", "neo-sylphid", "승", "3/2(1)"],
      ["2026-04-09", "opponent-b", "Z", "polypoid", "패", "3/2(2)"],
      ["2026-04-08", "opponent-c", "P", "outsider", "승", "3/2(3)"],
    ]);

    const actual = buildServingStatsByName([
      {
        name: "__stable_only_player__",
        eloboard_id: "eloboard:male:99999",
        gender: "male",
      },
    ]);

    const stats = actual.get("__stable_only_player__");
    assert.ok(stats);
    assert.equal(actual.get("male:99999"), stats);
    assert.equal(stats.wins, 2);
    assert.equal(stats.losses, 1);
    assert.equal(stats.history.length, 3);
    assert.deepEqual(stats.history.map((row) => row.match_date), ["2026-04-10", "2026-04-09", "2026-04-08"]);
  } finally {
    try {
      fs.unlinkSync(path.join(TMP_DIR, fileName));
    } catch {}
  }
});

runTest("buildServingStatsByIdentity exposes identity-keyed lookup for stable-only players", () => {
  const fileName = "eloboard_female_88888___stable_only_identity__.csv";
  try {
    writeStableCsv(fileName, [
      ["2026-04-10", "opponent-a", "T", "neo-sylphid", "승", "3/2(1)"],
      ["2026-04-09", "opponent-b", "Z", "polypoid", "패", "3/2(2)"],
    ]);

    const actual = buildServingStatsByIdentity([
      {
        name: "__stable_only_identity__",
        eloboard_id: "eloboard:female:88888",
        gender: "female",
      },
    ]);

    const stats = actual.get("female:88888");
    assert.ok(stats);
    assert.equal(stats.wins, 1);
    assert.equal(stats.losses, 1);
    assert.equal(actual.get("__stable_only_identity__"), stats);
  } finally {
    try {
      fs.unlinkSync(path.join(TMP_DIR, fileName));
    } catch {}
  }
});

runTest("buildServingPayload preserves existing serving stats when current source stats are missing", () => {
  const actual = buildServingPayload(
    "fallback-player",
    new Map(),
    {
      detailed_stats: { win_rate: 61.5 },
      match_history: [{ match_date: "2026-04-01", opponent_name: "opponent", is_win: true }],
      total_wins: 80,
      total_losses: 50,
      win_rate: 61.5,
      last_synced_at: "2026-04-19T00:00:00.000Z",
    }
  );

  assert.deepEqual(actual, {
    detailed_stats: { win_rate: 61.5 },
    match_history: [{ match_date: "2026-04-01", opponent_name: "opponent", is_win: true }],
    total_wins: 80,
    total_losses: 50,
    win_rate: 61.5,
    last_synced_at: "2026-04-19T00:00:00.000Z",
  });
});

runTest("buildServingPayload still initializes empty serving stats for brand-new players without source stats", () => {
  const actual = buildServingPayload("new-player", new Map(), null);

  assert.deepEqual(actual, {
    detailed_stats: null,
    match_history: null,
    total_wins: 0,
    total_losses: 0,
    win_rate: 0,
    last_synced_at: null,
  });
});

runTest("buildSyncIdentityKey collapses mix and non-mix entity variants onto the same wr_id key", () => {
  assert.equal(buildSyncIdentityKey({ eloboard_id: "eloboard:male:913", gender: "male" }), "male:913");
  assert.equal(buildSyncIdentityKey({ eloboard_id: "eloboard:male:mix:913", gender: "male" }), "male:913");
  assert.equal(buildSyncIdentityKey({ eloboard_id: "eloboard:female:704" }), "female:704");
});

runTest("findProductionIdentityConflicts flags same-name rows with different durable identities", () => {
  const actual = findProductionIdentityConflicts(
    [{ name: "same-name", eloboard_id: "eloboard:female:111", gender: "female" }],
    [{ name: "same-name", eloboard_id: "eloboard:female:222", gender: "female" }]
  );

  assert.equal(actual.length, 1);
  assert.equal(actual[0].name, "same-name");
  assert.equal(actual[0].existing_identity, "female:111");
  assert.equal(actual[0].incoming_identity, "female:222");
});

runTest("selectStaleProductionRows deletes renamed rows for the same entity but keeps active names", () => {
  const actual = selectStaleProductionRows(
    [
      { name: "old-name", eloboard_id: "eloboard:male:913" },
      { name: "active-player", eloboard_id: "eloboard:male:777" },
    ],
    [
      { name: "new-name", eloboard_id: "eloboard:male:913" },
      { name: "active-player", eloboard_id: "eloboard:male:777" },
    ]
  );

  assert.deepEqual(actual, [{ name: "old-name", eloboard_id: "eloboard:male:913" }]);
});

runTest("findUnsafeStaleDeleteRows flags stale delete candidates without durable identities", () => {
  const actual = findUnsafeStaleDeleteRows([
    { name: "old-name", eloboard_id: "eloboard:male:913" },
    { name: "unknown-name-only" },
    { eloboard_id: "" },
  ]);

  assert.deepEqual(actual, [{ name: "unknown-name-only" }, { eloboard_id: "" }]);
});

runTest("resolveSoopServingMetadata falls back by wr_id only for mix identities", () => {
  const soopLookup = {
    lookup: new Map([
      ["57:female", { soop_id: "slia", broadcast_url: "https://ch.sooplive.co.kr/slia" }],
      ["1055:female", { soop_id: "tkdduddb06", broadcast_url: "https://ch.sooplive.co.kr/tkdduddb06" }],
    ]),
    byWrId: new Map([
      ["57", { soop_id: "slia", broadcast_url: "https://ch.sooplive.co.kr/slia" }],
      ["1055", { soop_id: "tkdduddb06", broadcast_url: "https://ch.sooplive.co.kr/tkdduddb06" }],
    ]),
    byNameGender: new Map(),
    byName: new Map(),
  };

  assert.deepEqual(
    resolveSoopServingMetadata({ eloboard_id: "eloboard:male:mix:1055", gender: "male" }, soopLookup),
    { soop_id: "tkdduddb06", broadcast_url: "https://ch.sooplive.co.kr/tkdduddb06" }
  );

  assert.deepEqual(
    resolveSoopServingMetadata({ eloboard_id: "eloboard:male:57", gender: "male" }, soopLookup),
    { soop_id: null, broadcast_url: null }
  );
});

runTest("resolveSoopServingMetadata honors exact wr_id + gender even when serving name differs from metadata alias", () => {
  const soopLookup = {
    lookup: new Map([
      ["48:male", { name: "canon-a", soop_id: "rlatldgus", broadcast_url: "https://ch.sooplive.co.kr/rlatldgus" }],
      ["46:male", { name: "canon-b", soop_id: "arinbbidol", broadcast_url: "https://ch.sooplive.co.kr/arinbbidol" }],
    ]),
    byWrId: new Map([
      ["48", { name: "canon-a", soop_id: "rlatldgus", broadcast_url: "https://ch.sooplive.co.kr/rlatldgus" }],
      ["46", { name: "canon-b", soop_id: "arinbbidol", broadcast_url: "https://ch.sooplive.co.kr/arinbbidol" }],
    ]),
    byNameGender: new Map(),
    byName: new Map(),
  };

  assert.deepEqual(
    resolveSoopServingMetadata({ eloboard_id: "eloboard:male:48", gender: "male", name: "alias-a" }, soopLookup),
    { soop_id: "rlatldgus", broadcast_url: "https://ch.sooplive.co.kr/rlatldgus" }
  );

  assert.deepEqual(
    resolveSoopServingMetadata({ eloboard_id: "eloboard:male:46", gender: "male", name: "alias-b" }, soopLookup),
    { soop_id: "arinbbidol", broadcast_url: "https://ch.sooplive.co.kr/arinbbidol" }
  );
});
