const assert = require("node:assert/strict");

const {
  computeServingIdentityKey,
  summarizeServingIdentityRows,
} = require("./check-serving-identity-readiness");

function runTest(name, fn) {
  try {
    fn();
    console.log(`PASS ${name}`);
  } catch (error) {
    console.error(`FAIL ${name}`);
    throw error;
  }
}

runTest("computeServingIdentityKey collapses mix and non-mix variants", () => {
  assert.equal(
    computeServingIdentityKey({ eloboard_id: "eloboard:male:mix:913", gender: "male" }),
    "male:913"
  );
  assert.equal(
    computeServingIdentityKey({ eloboard_id: "eloboard:male:913", gender: "male" }),
    "male:913"
  );
});

runTest("computeServingIdentityKey falls back to eloboard gender when row gender is missing", () => {
  assert.equal(
    computeServingIdentityKey({ eloboard_id: "eloboard:female:704", gender: null }),
    "female:704"
  );
});

runTest("summarizeServingIdentityRows reports duplicate buckets and missing identities", () => {
  const summary = summarizeServingIdentityRows([
    { name: "A", eloboard_id: "eloboard:male:1", gender: "male" },
    { name: "A mix", eloboard_id: "eloboard:male:mix:1", gender: "male" },
    { name: "Missing", eloboard_id: null, gender: "male" },
  ]);

  assert.equal(summary.rows, 3);
  assert.equal(summary.missing_eloboard_id_rows, 1);
  assert.equal(summary.duplicate_serving_identity_buckets, 1);
  assert.equal(summary.duplicate_samples[0].serving_identity_key, "male:1");
});
