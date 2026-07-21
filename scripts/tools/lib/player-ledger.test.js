const fs = require("fs");
const os = require("os");
const path = require("path");
const assert = require("node:assert/strict");
const {
  LEDGER_PATH,
  loadOpponentIdentityDecisions,
  loadOpponentIdentityAliases,
} = require("./player-ledger");

function runTest(name, fn) {
  try {
    fn();
    console.log(`PASS ${name}`);
  } catch (error) {
    console.error(`FAIL ${name}`);
    throw error;
  }
}

function writeTmp(name, obj) {
  const file = path.join(os.tmpdir(), `player-ledger-test-${process.pid}-${name}.json`);
  fs.writeFileSync(file, JSON.stringify(obj));
  return file;
}

const ALLOWED_DECISIONS = new Set(["canonical_candidate", "external_opponent"]);

runTest("real ledger loads with the opponent-identity sections readers depend on", () => {
  const { decisions, allowed_decisions } = loadOpponentIdentityDecisions();
  const { aliases } = loadOpponentIdentityAliases();
  assert.ok(decisions.length > 0, "decisions present");
  assert.ok(aliases.length > 0, "aliases present");
  assert.deepEqual(allowed_decisions, ["canonical_candidate", "external_opponent"]);

  const seen = new Set();
  for (const row of decisions) {
    const name = String(row && row.opponent_name ? row.opponent_name : "").trim();
    assert.ok(name, "every decision has opponent_name");
    assert.ok(!seen.has(name), `no duplicate opponent_name: ${name}`);
    seen.add(name);
    assert.ok(ALLOWED_DECISIONS.has(row.decision), `decision in allowed set: ${row.decision}`);
    if (row.decision === "canonical_candidate") {
      assert.ok(
        String(row.canonical_name || "").trim() || String(row.target_entity_id || "").trim(),
        `canonical_candidate ${name} carries canonical_name or target_entity_id`
      );
    }
  }

  for (const row of aliases) {
    assert.ok(String(row && row.entity_id ? row.entity_id : "").trim(), "alias row has entity_id");
    assert.ok(Array.isArray(row.aliases) && row.aliases.length > 0, "alias row has aliases[]");
  }
});

// The loaders replaced opponent_identity_review_decisions.v1.json / opponent_identity_aliases.v1.json.
// A legacy-shaped fixture must normalize to the same shape as the ledger section — this is what keeps
// the existing reader tests (which inject legacy fixtures) byte-identical after the flip.
runTest("legacy-shaped fixture normalizes identically to the ledger shape", () => {
  const decisions = [
    { opponent_name: "다예", decision: "external_opponent", match_rows: 788, latest_match_date: "2026-05-14" },
    { opponent_name: "하루묭", decision: "canonical_candidate", target_entity_id: "eloboard:female:898", canonical_name: "하루묭" },
  ];
  const aliases = [{ entity_id: "eloboard:male:93", aliases: ["이광용"] }];

  const legacyDecisions = writeTmp("legacy-dec", { allowed_decisions: ["canonical_candidate", "external_opponent"], policy: { x: 1 }, decisions });
  const ledgerDecisions = writeTmp("ledger-dec", { opponent_identity_decisions: { allowed_decisions: ["canonical_candidate", "external_opponent"], policy: { x: 1 }, decisions } });
  assert.deepEqual(loadOpponentIdentityDecisions(legacyDecisions), loadOpponentIdentityDecisions(ledgerDecisions));

  const legacyAliases = writeTmp("legacy-ali", { aliases });
  const ledgerAliases = writeTmp("ledger-ali", { opponent_identity_aliases: aliases });
  assert.deepEqual(loadOpponentIdentityAliases(legacyAliases), loadOpponentIdentityAliases(ledgerAliases));
});

runTest("missing source degrades to empty, never throws", () => {
  const missing = path.join(os.tmpdir(), `player-ledger-does-not-exist-${process.pid}.json`);
  assert.deepEqual(loadOpponentIdentityDecisions(missing), { allowed_decisions: [], policy: {}, decisions: [] });
  assert.deepEqual(loadOpponentIdentityAliases(missing), { aliases: [] });
});

console.log(`\nledger path: ${path.relative(process.cwd(), LEDGER_PATH)}`);
