const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const {
  applyRosterAdminOverrideToPlayer,
  buildStableIdentityKey,
  findHarmfulNameIdentityCollisions,
  findUnsafeUpsertIdentityRows,
} = require("./supabase-staging-sync");

const ROOT = path.resolve(__dirname, "..", "..");

function runTest(name, fn) {
  try {
    fn();
    console.log(`PASS ${name}`);
  } catch (error) {
    console.error(`FAIL ${name}`);
    throw error;
  }
}

runTest("buildStableIdentityKey collapses mix and non-mix entity variants onto the same wr_id key", () => {
  assert.equal(
    buildStableIdentityKey({ eloboard_id: "eloboard:male:913", gender: "male" }),
    "male:913"
  );
  assert.equal(
    buildStableIdentityKey({ eloboard_id: "eloboard:male:mix:913", gender: "male" }),
    "male:913"
  );
});

runTest("findHarmfulNameIdentityCollisions ignores same-wr_id duplicate variants", () => {
  const actual = findHarmfulNameIdentityCollisions([
    { name: "same-name", eloboard_id: "eloboard:male:913", gender: "male" },
    { name: "same-name", eloboard_id: "eloboard:male:mix:913", gender: "male" },
  ]);

  assert.deepEqual(actual, []);
});

runTest("findHarmfulNameIdentityCollisions reports distinct identities that share a display name", () => {
  const actual = findHarmfulNameIdentityCollisions([
    { name: "same-name", eloboard_id: "eloboard:female:111", gender: "female" },
    { name: "same-name", eloboard_id: "eloboard:female:222", gender: "female" },
  ]);

  assert.equal(actual.length, 1);
  assert.equal(actual[0].name, "same-name");
  assert.deepEqual(
    actual[0].identities.map((row) => row.identity_key).sort(),
    ["female:111", "female:222"]
  );
});

runTest("findUnsafeUpsertIdentityRows flags name-only and missing-name staging rows", () => {
  const actual = findUnsafeUpsertIdentityRows([
    { name: "stable-player", eloboard_id: "eloboard:female:111", gender: "female" },
    { name: "name-only-player" },
    { eloboard_id: "" },
  ]);

  assert.deepEqual(actual, [{ name: "name-only-player" }, { eloboard_id: "" }]);
});

runTest("staging sync applies admin-confirmed team tier race and name overrides", () => {
  const player = {
    entity_id: "eloboard:female:99991",
    name: "before-name",
    team_code: "jsa",
    team_name: "JSA",
    tier: "7",
    race: "Zerg",
  };
  const override = {
    entity_id: "eloboard:female:99991",
    name: "after-name",
    team_code: "hm",
    team_name: "HM",
    tier: "6",
    race: "Terran",
    manual_mode: "temporary",
  };

  const actual = applyRosterAdminOverrideToPlayer(player, override);

  assert.deepEqual(actual, {
    entity_id: "eloboard:female:99991",
    name: "after-name",
    display_name: "after-name",
    team_code: "hm",
    team_name: "HM",
    tier: "6",
    race: "Terran",
  });
  assert.equal(player.team_code, "jsa");
});

runTest("staging sync serves the broadcast display name, not the eloboard real name", () => {
  const source = fs.readFileSync(path.join(ROOT, "scripts", "tools", "supabase-staging-sync.js"), "utf8");

  // 엘로보드가 본명을 쓰기 시작해도 사이트에는 방송 표시명이 나와야 한다
  // (얍삽e -> 김준혁, 난수 -> 장영근 회귀를 막는다).
  // 표시명의 유일한 출처는 선수 대장이고(entity_id로 묶여 팀 이동에도 안 날아감),
  // roster의 display_name은 대장에 행이 없는 선수를 위한 보조값이다.
  assert.match(source, /name:\s*ledgerDisplayNames\.get\(.*\)\s*\|\|\s*p\.display_name\s*\|\|\s*p\.name/);
  assert.match(source, /const ledgerDisplayNames = loadPlayerDisplayNames\(\)/);
});

runTest("admin name override also wins over a stale display alias", () => {
  const actual = applyRosterAdminOverrideToPlayer(
    { entity_id: "eloboard:male:1", name: "real", display_name: "old-alias" },
    { entity_id: "eloboard:male:1", name: "corrected" }
  );

  assert.equal(actual.name, "corrected");
  assert.equal(actual.display_name, "corrected");
});

runTest("staging sync does not prepare SOOP live state from local snapshots", () => {
  const source = fs.readFileSync(path.join(ROOT, "scripts", "tools", "supabase-staging-sync.js"), "utf8");

  assert.doesNotMatch(source, /soop_live_snapshot\.generated\.v1\.json/);
  assert.doesNotMatch(source, /loadSoopSnapshot|resolveLiveState/);
  assert.doesNotMatch(source, /\bis_live:\s*isLive\b/);
});
