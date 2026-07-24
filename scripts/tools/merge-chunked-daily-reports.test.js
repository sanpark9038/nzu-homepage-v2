const assert = require("node:assert/strict");
const {
  buildMergedReports,
  dedupeAlerts,
  ensureConsistentAlertSettings,
} = require("./merge-chunked-daily-reports");

function runTest(name, fn) {
  try {
    fn();
    console.log(`PASS ${name}`);
  } catch (error) {
    console.error(`FAIL ${name}`);
    throw error;
  }
}

// Minimal chunk builder. buildMergedReports reads item.snapshot / item.alerts / item.tag
// plus item.snapshotPath / item.alertsPath (only for the source_* path list).
function chunk(tag, snapshot = {}, alerts = {}) {
  return {
    tag,
    snapshotPath: `tmp/reports/daily_pipeline_snapshot_${tag}.json`,
    alertsPath: `tmp/reports/daily_pipeline_alerts_${tag}.json`,
    snapshot,
    alerts: { alerts: [], ...alerts },
  };
}

// 1. Team rows from multiple chunks merge into one team list, and the zero_players
//    string is carried through verbatim onto the merged team row.
runTest("team rows merge across chunks and zero_players string is preserved", () => {
  const snapshots = [
    chunk("chunkA", {
      teams: [{ team: "Alpha", team_code: "ALP", players: 5, zero_players: "kim, lee" }],
    }),
    chunk("chunkB", {
      teams: [{ team: "Bravo", team_code: "BRV", players: 3, zero_players: "" }],
    }),
  ];

  const { mergedTeams, mergedSnapshot } = buildMergedReports(snapshots, {
    tags: ["chunkA", "chunkB"],
    outputDate: "2026-07-24",
  });

  assert.equal(mergedTeams.length, 2);
  // sorted by team_code
  assert.deepEqual(mergedTeams.map((t) => t.team_code), ["ALP", "BRV"]);
  const alp = mergedTeams.find((t) => t.team_code === "ALP");
  assert.equal(alp.zero_players, "kim, lee", "zero_players string preserved verbatim");
  assert.equal(mergedSnapshot.teams.length, 2, "merged snapshot carries the merged teams");
});

// 2a. dedupeAlerts collapses alerts that share (severity, team_code, rule, message).
runTest("dedupeAlerts collapses identical alerts from two chunks", () => {
  const dup = { severity: "high", team_code: "ALP", rule: "roster_gap", message: "missing player" };
  const out = dedupeAlerts([{ ...dup }, { ...dup }]);
  assert.equal(out.length, 1, "same key -> single row");

  const distinct = dedupeAlerts([
    { severity: "high", team_code: "ALP", rule: "roster_gap", message: "missing player" },
    { severity: "high", team_code: "BRV", rule: "roster_gap", message: "missing player" },
  ]);
  assert.equal(distinct.length, 2, "different team_code -> kept separate");
});

// 2b. stale_live_snapshot_disagreement alerts dedupe even when the trailing
//     report_generated_at=... differs (normalizeAlertMessage strips that suffix).
runTest("stale_live_snapshot_disagreement dedupes across differing report_generated_at", () => {
  const out = dedupeAlerts([
    {
      severity: "medium",
      team_code: "ALP",
      rule: "stale_live_snapshot_disagreement",
      message: "counts differ, report_generated_at=2026-07-24T01:00:00Z",
    },
    {
      severity: "medium",
      team_code: "ALP",
      rule: "stale_live_snapshot_disagreement",
      message: "counts differ, report_generated_at=2026-07-24T02:30:00Z",
    },
  ]);
  assert.equal(out.length, 1, "timestamp-only difference is normalized away before dedup");
});

// 2c. dedup flows through buildMergedReports and counts reflect the deduped rows.
runTest("buildMergedReports dedupes alerts across chunks and recomputes counts", () => {
  const dup = { severity: "critical", team_code: "ALP", rule: "fetch_fail", message: "down" };
  const snapshots = [
    chunk("chunkA", { teams: [] }, { alerts: [{ ...dup }], blocking_severities: ["critical", "high"], applied_rules: {} }),
    chunk("chunkB", { teams: [] }, { alerts: [{ ...dup }], blocking_severities: ["critical", "high"], applied_rules: {} }),
  ];
  const { mergedAlertRows, mergedAlerts } = buildMergedReports(snapshots, {
    tags: ["chunkA", "chunkB"],
    outputDate: "2026-07-24",
  });
  assert.equal(mergedAlertRows.length, 1);
  assert.equal(mergedAlerts.counts.critical, 1);
  assert.equal(mergedAlerts.counts.total, 1);
});

// 3. display_alias_apply: retired snapshots ({ok:true, retired:true}) still merge to ok:true;
//    an explicit ok:false in any chunk flips the merged ok to false.
runTest("display_alias_apply merges to ok:true for retired snapshots, false when a chunk fails", () => {
  const okSnaps = [
    chunk("chunkA", { display_alias_apply: { ok: true, retired: true, teams: [] } }),
    chunk("chunkB", { display_alias_apply: { ok: true, retired: true, teams: [] } }),
  ];
  const okMerged = buildMergedReports(okSnaps, { tags: ["chunkA", "chunkB"], outputDate: "2026-07-24" });
  assert.equal(okMerged.mergedSnapshot.display_alias_apply.ok, true);
  assert.equal(okMerged.mergedSnapshot.display_alias_apply.chunks.length, 2);

  const failSnaps = [
    chunk("chunkA", { display_alias_apply: { ok: true, retired: true } }),
    chunk("chunkB", { display_alias_apply: { ok: false } }),
  ];
  const failMerged = buildMergedReports(failSnaps, { tags: ["chunkA", "chunkB"], outputDate: "2026-07-24" });
  assert.equal(failMerged.mergedSnapshot.display_alias_apply.ok, false);
});

// 4. Edge cases the current code handles:
//    (a) chunks with no teams/failed_players/recovery_actions arrays don't throw.
//    (b) ensureConsistentAlertSettings throws when a later chunk's alert settings drift.
runTest("chunks missing optional arrays merge without throwing", () => {
  const snapshots = [chunk("chunkA", {}), chunk("chunkB", {})];
  const { mergedTeams, mergedSnapshot } = buildMergedReports(snapshots, {
    tags: ["chunkA", "chunkB"],
    outputDate: "2026-07-24",
  });
  assert.equal(mergedTeams.length, 0);
  assert.deepEqual(mergedSnapshot.failed_players, []);
  assert.deepEqual(mergedSnapshot.recovery_actions, []);
});

runTest("ensureConsistentAlertSettings throws when chunk alert settings mismatch", () => {
  const consistent = [
    { tag: "chunkA", alerts: { blocking_severities: ["critical", "high"], applied_rules: { r: 1 } } },
    { tag: "chunkB", alerts: { blocking_severities: ["critical", "high"], applied_rules: { r: 1 } } },
  ];
  assert.doesNotThrow(() => ensureConsistentAlertSettings(consistent));

  const mismatched = [
    { tag: "chunkA", alerts: { blocking_severities: ["critical", "high"], applied_rules: { r: 1 } } },
    { tag: "chunkB", alerts: { blocking_severities: ["critical"], applied_rules: { r: 1 } } },
  ];
  assert.throws(() => ensureConsistentAlertSettings(mismatched), /alert settings mismatch/i);
});

// 5. fa_record_metadata is taken from the first chunk only; later chunks' values are ignored.
runTest("fa_record_metadata comes from the first chunk", () => {
  const snapshots = [
    chunk("chunkA", { fa_record_metadata: { source: "first" } }),
    chunk("chunkB", { fa_record_metadata: { source: "second" } }),
  ];
  const { mergedSnapshot } = buildMergedReports(snapshots, {
    tags: ["chunkA", "chunkB"],
    outputDate: "2026-07-24",
  });
  assert.deepEqual(mergedSnapshot.fa_record_metadata, { source: "first" });
});

console.log("all merge-chunked-daily-reports tests passed");
