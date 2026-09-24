const assert = require("node:assert/strict");

const {
  evaluateMatches,
  evaluatePlayerList,
  formatMarkdown,
  pickSamplePlayers,
} = require("./check-pipeline-collection-sources-health");

function runTest(name, fn) {
  try {
    fn();
    console.log(`PASS ${name}`);
  } catch (error) {
    console.error(`FAIL ${name}`);
    throw error;
  }
}

runTest("evaluatePlayerList requires ids and at least one soop_id (the identity key)", () => {
  assert.equal(evaluatePlayerList([{ id: 1, soop_id: "abc" }, { id: 2, soop_id: null }]).ok, true);
  assert.equal(evaluatePlayerList([{ id: 1, soop_id: null }]).ok, false);
  assert.equal(evaluatePlayerList([]).ok, false);
  assert.equal(evaluatePlayerList({ error: "x" }).ok, false);
});

runTest("evaluateMatches requires participants with a win/loss result", () => {
  const good = {
    played_on: "2026-09-24",
    participants: [
      { player_id: 1, result: "win" },
      { player_id: 2, result: "loss" },
    ],
  };
  assert.deepEqual(evaluateMatches([good]), { ok: true, row_count: 1, latest_played_on: "2026-09-24" });
  assert.equal(evaluateMatches([good, { played_on: "2026-09-24", participants: [] }]).ok, false);
  assert.equal(evaluateMatches([]).ok, false);
});

runTest("pickSamplePlayers takes one active men and one active women sample", () => {
  const samples = pickSamplePlayers([
    { id: 1, division: "men", last_played_on: "2026-09-24" },
    { id: 2, division: "men", last_played_on: "2026-09-24" },
    { id: 3, division: "women", last_played_on: null },
    { id: 4, division: "women", last_played_on: "2026-09-20" },
  ]);
  assert.deepEqual(samples.map((p) => p.id), [1, 4]);
});

runTest("formatMarkdown summarizes health checks", () => {
  const markdown = formatMarkdown({
    ok: false,
    generated_at: "2026-09-25T00:00:00.000Z",
    checks: {
      player_list: { ok: true, player_count: 200 },
      player_matches: {
        ok: true,
        samples: [{ ok: true, division: "men", player: "김지성", latest_played_on: "2026-09-24" }],
      },
      colleges: { ok: false, error: "source_outage: HTTP 500" },
    },
  });

  assert.match(markdown, /Overall: failed/);
  assert.match(markdown, /Player List: ok/);
  assert.match(markdown, /Players \(first page\): 200/);
  assert.match(markdown, /Matches Sample \(men 김지성\): ok latest=2026-09-24/);
  assert.match(markdown, /Colleges: failed/);
  assert.match(markdown, /colleges error: source_outage: HTTP 500/);
});
