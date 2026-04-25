const assert = require("node:assert/strict");

const {
  buildStableIdentityKey,
  findHarmfulNameIdentityCollisions,
  findUnsafeUpsertIdentityRows,
  resolveLiveState,
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

runTest("resolveLiveState does not use name fallback for durable eloboard identities", () => {
  const yuzuPayload = { soop_id: "yuzzzz" };
  const soopLookup = {
    lookup: new Map([["1024:female", yuzuPayload]]),
    byWrId: new Map([["1024", yuzuPayload]]),
    byNameGender: new Map([["히요코:female", yuzuPayload]]),
    byName: new Map([["히요코", yuzuPayload]]),
  };
  const snapshot = {
    isFresh: true,
    channels: {
      yuzzzz: { isLive: true },
    },
  };

  assert.equal(
    resolveLiveState({ entity_id: "eloboard:female:889", gender: "female", name: "히요코" }, soopLookup, snapshot),
    false
  );
  assert.equal(
    resolveLiveState({ entity_id: "eloboard:female:1024", gender: "female", name: "유즈" }, soopLookup, snapshot),
    true
  );
});
