const fs = require("fs");
const path = require("path");
const assert = require("node:assert/strict");

const ROOT = path.join(__dirname, "..", "..");
const TMP_DIR = path.join(ROOT, "tmp");

const {
  filterPlayersByEntityIds,
  shouldUseNoCacheForFetch,
  shouldFetchWithNoCache,
  shouldSkipByPriorityWindow,
  shouldReuseInactiveExistingJson,
} = require("./export-team-roster-detailed");

function runTest(name, fn) {
  try {
    fn();
    console.log(`PASS ${name}`);
  } catch (error) {
    console.error(`FAIL ${name}`);
    throw error;
  }
}

function writeTempJson(fileName, value = {}) {
  fs.mkdirSync(TMP_DIR, { recursive: true });
  const filePath = path.join(TMP_DIR, fileName);
  fs.writeFileSync(filePath, JSON.stringify(value), "utf8");
  return filePath;
}

runTest("shouldSkipByPriorityWindow reuses recent cached json within interval", () => {
  const filePath = writeTempJson("__test__priority_window_recent.json");
  try {
    const today = "2026-04-09T00:00:00.000Z";
    const yesterday = new Date("2026-04-08T12:00:00.000Z");
    fs.utimesSync(filePath, yesterday, yesterday);

    assert.equal(
      shouldSkipByPriorityWindow(
        { last_checked_at: "2026-04-08T08:00:00.000Z", check_interval_days: 3 },
        today,
        filePath
      ),
      true
    );
  } finally {
    try {
      fs.unlinkSync(filePath);
    } catch {}
  }
});

runTest("shouldSkipByPriorityWindow forces recollect when cached json is stale", () => {
  const filePath = writeTempJson("__test__priority_window_stale.json");
  try {
    const today = "2026-04-09T00:00:00.000Z";
    const stale = new Date("2026-04-05T12:00:00.000Z");
    fs.utimesSync(filePath, stale, stale);

    assert.equal(
      shouldSkipByPriorityWindow(
        { last_checked_at: "2026-04-08T08:00:00.000Z", check_interval_days: 3 },
        today,
        filePath
      ),
      false
    );
  } finally {
    try {
      fs.unlinkSync(filePath);
    } catch {}
  }
});

runTest("inactive reuse does not bypass due priority-window recollection", () => {
  const filePath = writeTempJson("__test__inactive_due_priority.json", {
    players: [{ period_max_date: "2026-04-20" }],
  });
  try {
    assert.equal(
      shouldReuseInactiveExistingJson(
        { last_checked_at: "2026-05-01T00:00:00.000Z", check_interval_days: 3 },
        14,
        "2026-05-14T00:00:00.000Z",
        filePath
      ),
      false
    );
  } finally {
    try {
      fs.unlinkSync(filePath);
    } catch {}
  }
});

runTest("inactive reuse still protects legacy players without priority metadata", () => {
  const filePath = writeTempJson("__test__inactive_legacy_player.json", {
    players: [{ period_max_date: "2026-04-20" }],
  });
  try {
    assert.equal(
      shouldReuseInactiveExistingJson({}, 14, "2026-05-14T00:00:00.000Z", filePath),
      true
    );
  } finally {
    try {
      fs.unlinkSync(filePath);
    } catch {}
  }
});

runTest("due one-day priority players bypass source cache on fetch", () => {
  const filePath = writeTempJson("__test__due_priority_no_cache.json", {
    players: [{ period_max_date: "2026-05-14" }],
  });
  try {
    const today = "2026-05-16T00:00:00.000Z";
    const recentCachedFile = new Date("2026-05-15T20:00:00.000Z");
    fs.utimesSync(filePath, recentCachedFile, recentCachedFile);

    assert.equal(
      shouldFetchWithNoCache(
        {
          last_checked_at: "2026-05-14T15:47:26.614Z",
          last_match_at: "2026-05-14T00:00:00.000Z",
          check_interval_days: 1,
        },
        today,
        filePath
      ),
      true
    );
  } finally {
    try {
      fs.unlinkSync(filePath);
    } catch {}
  }
});

runTest("recent priority-window players can still use source cache", () => {
  const filePath = writeTempJson("__test__recent_priority_cache.json", {
    players: [{ period_max_date: "2026-05-15" }],
  });
  try {
    const today = "2026-05-16T00:00:00.000Z";
    const recentCachedFile = new Date("2026-05-15T20:00:00.000Z");
    fs.utimesSync(filePath, recentCachedFile, recentCachedFile);

    assert.equal(
      shouldFetchWithNoCache(
        {
          last_checked_at: "2026-05-15T20:00:00.000Z",
          last_match_at: "2026-05-15T00:00:00.000Z",
          check_interval_days: 1,
        },
        today,
        filePath
      ),
      false
    );
  } finally {
    try {
      fs.unlinkSync(filePath);
    } catch {}
  }
});

runTest("filterPlayersByEntityIds keeps only requested canonical players", () => {
  const roster = [
    { entity_id: "eloboard:male:37", name: "A" },
    { entity_id: "eloboard:female:956", name: "B" },
    { entity_id: "eloboard:male:8", name: "C" },
  ];

  assert.deepEqual(filterPlayersByEntityIds(roster, " female:956, male:37 "), [
    { entity_id: "eloboard:male:37", name: "A" },
    { entity_id: "eloboard:female:956", name: "B" },
  ]);
});

runTest("filterPlayersByEntityIds returns full roster when no entity ids are requested", () => {
  const roster = [{ entity_id: "male:37", name: "A" }];

  assert.deepEqual(filterPlayersByEntityIds(roster, ""), roster);
});

runTest("shouldUseNoCacheForFetch honors an explicit force flag", () => {
  assert.equal(shouldUseNoCacheForFetch({ forceNoCache: true }, {}, "2026-05-16", ""), true);
});
