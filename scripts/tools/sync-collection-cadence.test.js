const assert = require("node:assert/strict");
const fs = require("fs");
const os = require("os");
const path = require("path");
const {
  CADENCE_FIELDS,
  DEFAULT_PREFIX,
  BOOKMARKS_KEY,
  getR2Config,
  stateIsNewer,
  overlayRosterCadence,
  extractRosterCadence,
  hydrateBookmarks,
  persistBookmarks,
  hydrate,
  persist,
} = require("./sync-collection-cadence");

function runTest(name, fn) {
  try {
    fn();
    console.log(`PASS ${name}`);
  } catch (error) {
    console.error(`FAIL ${name}`);
    throw error;
  }
}

async function runAsync(name, fn) {
  try {
    await fn();
    console.log(`PASS ${name}`);
  } catch (error) {
    console.error(`FAIL ${name}`);
    throw error;
  }
}

function makeRow(overrides = {}) {
  return {
    entity_id: "eloboard:male:20",
    name: "김범수",
    team_code: "bgm",
    tier: "잭",
    race: "Protoss",
    last_checked_at: "2026-05-14T15:42:29.013Z",
    last_match_at: "2026-04-07T00:00:00.000Z",
    check_priority: "normal",
    check_interval_days: 3,
    ...overrides,
  };
}

runTest("overlay writes only the four cadence fields when state is newer, leaving other fields untouched", () => {
  const doc = { roster: [makeRow()] };
  const state = {
    "eloboard:male:20": {
      last_checked_at: "2026-07-20T12:00:00.000Z",
      last_match_at: "2026-07-18T00:00:00.000Z",
      check_priority: "high",
      check_interval_days: 1,
    },
  };
  const { updated, skipped } = overlayRosterCadence(doc, state);
  const row = doc.roster[0];
  assert.equal(skipped, false);
  assert.equal(updated, 1);
  assert.equal(row.last_checked_at, "2026-07-20T12:00:00.000Z");
  assert.equal(row.last_match_at, "2026-07-18T00:00:00.000Z");
  assert.equal(row.check_priority, "high");
  assert.equal(row.check_interval_days, 1);
  // Non-cadence identity fields must be byte-identical.
  assert.equal(row.name, "김범수");
  assert.equal(row.tier, "잭");
  assert.equal(row.race, "Protoss");
  assert.equal(row.team_code, "bgm");
});

runTest("overlay keeps the file when its last_checked_at is newer than state (manual-edit protection)", () => {
  const doc = { roster: [makeRow({ last_checked_at: "2026-08-01T00:00:00.000Z", check_priority: "normal" })] };
  const state = {
    "eloboard:male:20": {
      last_checked_at: "2026-07-20T12:00:00.000Z",
      last_match_at: "2026-07-18T00:00:00.000Z",
      check_priority: "high",
      check_interval_days: 1,
    },
  };
  const { updated } = overlayRosterCadence(doc, state);
  assert.equal(updated, 0);
  assert.equal(doc.roster[0].check_priority, "normal");
  assert.equal(doc.roster[0].last_checked_at, "2026-08-01T00:00:00.000Z");
});

runTest("overlay ignores entity_ids present in state but absent from the roster", () => {
  const doc = { roster: [makeRow()] };
  const state = {
    "eloboard:male:999": { last_checked_at: "2026-07-20T12:00:00.000Z", check_priority: "high", check_interval_days: 1 },
  };
  const { updated } = overlayRosterCadence(doc, state);
  assert.equal(updated, 0);
  assert.equal(doc.roster.length, 1);
});

runTest("overlay skips manual_managed team docs entirely", () => {
  const doc = { manual_managed: true, roster: [makeRow()] };
  const state = {
    "eloboard:male:20": { last_checked_at: "2026-07-20T12:00:00.000Z", check_priority: "high", check_interval_days: 1 },
  };
  const { updated, skipped, reason } = overlayRosterCadence(doc, state);
  assert.equal(skipped, true);
  assert.equal(reason, "manual_managed");
  assert.equal(updated, 0);
  assert.equal(doc.roster[0].check_priority, "normal");
});

runTest("overlay treats a file with missing timestamp as older than valid state", () => {
  const doc = { roster: [makeRow({ last_checked_at: null })] };
  const state = {
    "eloboard:male:20": { last_checked_at: "2026-07-20T12:00:00.000Z", check_priority: "high", check_interval_days: 1 },
  };
  const { updated } = overlayRosterCadence(doc, state);
  assert.equal(updated, 1);
  assert.equal(doc.roster[0].check_priority, "high");
});

runTest("stateIsNewer only wins when strictly newer and valid", () => {
  assert.equal(stateIsNewer("2026-07-20T00:00:00Z", "2026-05-01T00:00:00Z"), true);
  assert.equal(stateIsNewer("2026-05-01T00:00:00Z", "2026-07-20T00:00:00Z"), false);
  assert.equal(stateIsNewer("2026-05-01T00:00:00Z", "2026-05-01T00:00:00Z"), false);
  assert.equal(stateIsNewer("2026-05-01T00:00:00Z", null), true);
  assert.equal(stateIsNewer(null, "2026-05-01T00:00:00Z"), false);
  assert.equal(stateIsNewer("not-a-date", "2026-05-01T00:00:00Z"), false);
});

runTest("extract produces an entity_id → four-field map, skipping rows without entity_id", () => {
  const doc = {
    roster: [
      makeRow(),
      makeRow({ entity_id: "eloboard:male:93", check_priority: "high", check_interval_days: 1 }),
      makeRow({ entity_id: "" }),
    ],
  };
  const map = extractRosterCadence(doc);
  assert.deepEqual(Object.keys(map).sort(), ["eloboard:male:20", "eloboard:male:93"]);
  assert.deepEqual(Object.keys(map["eloboard:male:20"]).sort(), [...CADENCE_FIELDS].sort());
  assert.equal(map["eloboard:male:93"].check_priority, "high");
  // Only cadence fields, never name/tier/etc.
  assert.equal("name" in map["eloboard:male:20"], false);
});

runTest("getR2Config returns null when unset", () => {
  assert.equal(getR2Config({}, DEFAULT_PREFIX), null);
});

runTest("getR2Config never falls back to generic R2_* (that is the public board-image bucket)", () => {
  const generic = getR2Config(
    { R2_ACCOUNT_ID: "acc", R2_ACCESS_KEY_ID: "key", R2_SECRET_ACCESS_KEY: "secret", R2_BUCKET_NAME: "board-images" },
    DEFAULT_PREFIX
  );
  assert.equal(generic, null);
});

runTest("getR2Config falls back to PLAYER_HISTORY_R2_* when PIPELINE_STATE_R2_* is unset", () => {
  const fallback = getR2Config(
    {
      PLAYER_HISTORY_R2_ACCOUNT_ID: "acc",
      PLAYER_HISTORY_R2_ACCESS_KEY_ID: "key",
      PLAYER_HISTORY_R2_SECRET_ACCESS_KEY: "secret",
      PLAYER_HISTORY_R2_BUCKET_NAME: "history-bucket",
    },
    DEFAULT_PREFIX
  );
  assert.equal(fallback.bucketName, "history-bucket");
  assert.equal(fallback.prefix, "pipeline-state");
});

runTest("getR2Config prefers PIPELINE_STATE_R2_* over PLAYER_HISTORY and honors custom prefix", () => {
  const prefixed = getR2Config(
    {
      PLAYER_HISTORY_R2_ACCOUNT_ID: "acc",
      PLAYER_HISTORY_R2_ACCESS_KEY_ID: "key",
      PLAYER_HISTORY_R2_SECRET_ACCESS_KEY: "secret",
      PLAYER_HISTORY_R2_BUCKET_NAME: "history-bucket",
      PIPELINE_STATE_R2_BUCKET_NAME: "state-bucket",
      PIPELINE_STATE_R2_PREFIX: "custom-state",
    },
    DEFAULT_PREFIX
  );
  assert.equal(prefixed.bucketName, "state-bucket");
  assert.equal(prefixed.prefix, "custom-state");
});

const FAKE_CONFIG = { bucketName: "bucket", prefix: "pipeline-state" };

function tempBookmarkPath(name) {
  return path.join(fs.mkdtempSync(path.join(os.tmpdir(), "bookmarks-")), name);
}

(async () => {
  await runAsync("bookmark hydrate never clobbers a live local file with an empty remote", async () => {
    const bookmarksPath = tempBookmarkPath("roster_report_cache.json");
    const local = { version: 2, players: { "eloboard:male:20": { latest_key: "keep-me" } } };
    fs.writeFileSync(bookmarksPath, JSON.stringify(local), "utf8");
    const client = { send: async () => ({ Body: { transformToString: async () => JSON.stringify({ players: {} }) } }) };

    const res = await hydrateBookmarks(FAKE_CONFIG, { bookmarksPath, log: () => {}, client });
    assert.equal(res.skipped, true);
    assert.equal(res.reason, "empty_remote");
    assert.deepEqual(JSON.parse(fs.readFileSync(bookmarksPath, "utf8")), local);
  });

  await runAsync("bookmark hydrate restores the remote file when it carries bookmarks", async () => {
    const bookmarksPath = tempBookmarkPath("roster_report_cache.json");
    const remote = { version: 2, players: { "eloboard:female:9": { latest_key: "2026-07-25|A|B|+1|| " } } };
    const client = { send: async () => ({ Body: { transformToString: async () => JSON.stringify(remote) } }) };

    const res = await hydrateBookmarks(FAKE_CONFIG, { bookmarksPath, log: () => {}, client });
    assert.equal(res.skipped, false);
    assert.equal(res.bookmarks, 1);
    assert.deepEqual(JSON.parse(fs.readFileSync(bookmarksPath, "utf8")), remote);
  });

  await runAsync("bookmark persist uploads the local file and never uploads an empty one", async () => {
    const bookmarksPath = tempBookmarkPath("roster_report_cache.json");
    const puts = [];
    const client = { send: async (cmd) => puts.push(cmd) };

    const missing = await persistBookmarks(FAKE_CONFIG, { bookmarksPath, log: () => {}, client });
    assert.equal(missing.skipped, true);
    assert.equal(missing.reason, "missing_local_file");

    fs.writeFileSync(bookmarksPath, JSON.stringify({ version: 2, players: {} }), "utf8");
    const empty = await persistBookmarks(FAKE_CONFIG, { bookmarksPath, log: () => {}, client });
    assert.equal(empty.skipped, true);
    assert.equal(empty.reason, "empty_local_file");
    assert.equal(puts.length, 0);

    fs.writeFileSync(
      bookmarksPath,
      JSON.stringify({ version: 2, players: { "eloboard:male:20": { latest_key: "k" } } }),
      "utf8"
    );
    const ok = await persistBookmarks(FAKE_CONFIG, { bookmarksPath, log: () => {}, client });
    assert.equal(ok.skipped, false);
    assert.equal(ok.bookmarks, 1);
    assert.equal(puts.length, 1);
    assert.equal(puts[0].input.Key, `pipeline-state/${BOOKMARKS_KEY}`);
  });

  await runAsync("hydrate degrades to a no-op (never throws) when R2 is unconfigured", async () => {
    const logs = [];
    const res = await hydrate({ env: {}, log: (m) => logs.push(m) });
    assert.equal(res.skipped, true);
    assert.equal(res.reason, "missing_r2_env");
    assert.match(logs.join("\n"), /hydrate skipped/);
  });

  await runAsync("persist degrades to a no-op (never throws) when R2 is unconfigured", async () => {
    const logs = [];
    const res = await persist({ env: {}, log: (m) => logs.push(m) });
    assert.equal(res.skipped, true);
    assert.equal(res.reason, "missing_r2_env");
    assert.match(logs.join("\n"), /persist skipped/);
  });
})().catch((error) => {
  console.error(error);
  process.exit(1);
});
