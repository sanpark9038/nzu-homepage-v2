const assert = require("node:assert/strict");

const {
  buildStableIdentityKey,
  findHarmfulNameIdentityCollisions,
  findUnsafeUpsertIdentityRows,
} = require("./supabase-staging-sync");

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
    { name: "빡재TV", eloboard_id: "eloboard:male:913", gender: "male" },
    { name: "빡재TV", eloboard_id: "eloboard:male:mix:913", gender: "male" },
  ]);

  assert.deepEqual(actual, []);
});

runTest("findHarmfulNameIdentityCollisions reports distinct identities that share a display name", () => {
  const actual = findHarmfulNameIdentityCollisions([
    { name: "김민주", eloboard_id: "eloboard:female:111", gender: "female" },
    { name: "김민주", eloboard_id: "eloboard:female:222", gender: "female" },
  ]);

  assert.equal(actual.length, 1);
  assert.equal(actual[0].name, "김민주");
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
