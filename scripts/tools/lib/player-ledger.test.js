const fs = require("fs");
const os = require("os");
const path = require("path");
const assert = require("node:assert/strict");
const {
  LEDGER_PATH,
  loadOpponentIdentityDecisions,
  loadOpponentIdentityAliases,
  loadCollectionExclusions,
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
  assert.deepEqual(loadCollectionExclusions(missing), []);
});

// 수집 제외 흡수: 대장(players[].excluded + collection_exclusions_without_entity)이 옛 수집 제외
// 파일의 players[] 행으로 복원되고, 레거시 파일(players=배열)은 dual-shape로 그대로 반환돼
// 기존 리더/테스트 fixture가 무변경으로 동작한다.
runTest("collection exclusions restore identically from ledger shape and legacy shape (+ without_entity)", () => {
  const ledger = {
    players: {
      "eloboard:male:118": {
        display_name: "김수환",
        excluded: {
          name: "김수환",
          wr_id: 118,
          reason: "user_excluded_unneeded_for_homepage",
          updated_at: "2026-05-15T15:03:41.507Z",
        },
      },
      "eloboard:female:889": {
        excluded: { name: "Hiyoko", wr_id: 889, reason: "user_excluded_retired_or_unneeded", note: "keep note" },
      },
      "eloboard:male:9999": { display_name: "표시만" }, // excluded 없음 → 복원 대상 아님
    },
    collection_exclusions_without_entity: [{ name: "옥수수", wr_id: 1022, reason: "user_excluded" }],
  };
  const legacyRows = [
    {
      entity_id: "eloboard:male:118",
      wr_id: 118,
      name: "김수환",
      reason: "user_excluded_unneeded_for_homepage",
      updated_at: "2026-05-15T15:03:41.507Z",
    },
    { entity_id: "eloboard:female:889", wr_id: 889, name: "Hiyoko", reason: "user_excluded_retired_or_unneeded", note: "keep note" },
    { name: "옥수수", wr_id: 1022, reason: "user_excluded" },
  ];

  const fromLedger = loadCollectionExclusions(writeTmp("exc-ledger", ledger));
  const fromLegacy = loadCollectionExclusions(writeTmp("exc-legacy", { players: legacyRows }));

  // dual-shape: 레거시 파일은 rows[] 그대로 반환
  assert.deepEqual(fromLegacy, legacyRows);

  // 대장 복원 == 레거시 행 (순서 무관, 필드 동일)
  const tup = (r) =>
    JSON.stringify([r.entity_id || "", r.wr_id ?? "", r.name || "", r.reason || "", r.note || "", r.updated_at || ""]);
  assert.deepEqual(new Set(fromLedger.map(tup)), new Set(fromLegacy.map(tup)));

  // 표시명만 있는 행(excluded 없음)은 복원되지 않는다
  assert.ok(!fromLedger.some((r) => r.entity_id === "eloboard:male:9999"));
});

runTest("real ledger collection exclusions carry dedup outcome (no legacy name-only duplicates)", () => {
  const rows = loadCollectionExclusions();
  assert.ok(rows.length > 0, "exclusions present");

  // without_entity 3건은 wr_id로만 식별(이름-only 아님)
  const withoutEntity = rows.filter((r) => !r.entity_id);
  assert.ok(withoutEntity.length >= 1, "without_entity rows present");
  assert.ok(withoutEntity.every((r) => Number.isFinite(Number(r.wr_id))), "without_entity rows carry wr_id");

  // 저라뎃은 entity(male:mix:159)로 한 번만 — 옛 이름-only 중복 행은 흡수 시 제거됐다
  const jaradet = rows.filter((r) => r.name === "저라뎃");
  assert.equal(jaradet.length, 1);
  assert.ok(jaradet[0].entity_id, "저라뎃 is entity-based only");
});

console.log(`\nledger path: ${path.relative(process.cwd(), LEDGER_PATH)}`);
