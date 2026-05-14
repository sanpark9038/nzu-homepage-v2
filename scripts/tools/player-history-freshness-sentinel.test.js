const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const {
  buildDefaultSentinels,
  buildSourceReportArgs,
  compareFreshness,
  latestServingHistoryDate,
  parseSourceLatestDate,
} = require("./verify-player-history-freshness-sentinel");

const repoRoot = path.resolve(__dirname, "..", "..");

function runTest(name, fn) {
  try {
    fn();
    console.log(`PASS ${name}`);
  } catch (error) {
    console.error(`FAIL ${name}`);
    throw error;
  }
}

runTest("default sentinel includes the FM-009 player", () => {
  const sentinels = buildDefaultSentinels();

  assert.equal(sentinels.length, 1);
  assert.equal(sentinels[0].serving_identity_key, "male:37");
  assert.equal(sentinels[0].eloboard_id, "eloboard:male:37");
});

runTest("source report args force a no-cache single-player read", () => {
  const [sentinel] = buildDefaultSentinels();
  const args = buildSourceReportArgs(sentinel);

  assert.ok(args.includes("--no-cache"));
  assert.ok(args.includes("--json-only"));
  assert.ok(args.includes("--include-matches"));
  assert.ok(args.includes("--profile-url"));
  assert.ok(args.includes("https://eloboard.com/men/bbs/board.php?bo_table=bj_list&wr_id=37"));
});

runTest("source latest date comes from period_max_date", () => {
  const actual = parseSourceLatestDate({
    players: [{ period_max_date: "2026-05-14" }],
  });

  assert.equal(actual, "2026-05-14");
});

runTest("serving latest date uses match_history and last_match_at", () => {
  const actual = latestServingHistoryDate({
    last_match_at: "2026-05-13T00:00:00+00:00",
    match_history: [{ match_date: "2026-05-12" }, { match_date: "2026-05-14" }],
  });

  assert.equal(actual, "2026-05-14");
});

runTest("freshness comparison fails closed when production is older than source", () => {
  const actual = compareFreshness({
    sourceLatestDate: "2026-05-14",
    servingLatestDate: "2026-04-20",
  });

  assert.equal(actual.ok, false);
  assert.match(actual.reason, /serving_older_than_source/);
});

runTest("freshness comparison passes when serving caught up", () => {
  const actual = compareFreshness({
    sourceLatestDate: "2026-05-14",
    servingLatestDate: "2026-05-14",
  });

  assert.deepEqual(actual, {
    ok: true,
    reason: null,
  });
});

runTest("approved production push runs the sentinel after cache revalidation", () => {
  const source = fs.readFileSync(
    path.join(repoRoot, "scripts", "tools", "push-supabase-approved.js"),
    "utf8"
  );
  const revalidateIndex = source.indexOf("revalidate_public_cache");
  const sentinelIndex = source.indexOf("player_history_freshness_sentinel");

  assert.ok(revalidateIndex >= 0);
  assert.ok(sentinelIndex > revalidateIndex);
  assert.match(source, /verify-player-history-freshness-sentinel\.js/);
});
