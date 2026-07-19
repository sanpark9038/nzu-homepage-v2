const assert = require("node:assert/strict");
const {
  evaluateTemporaryOverrideAgainstObserved,
  isReleasableTemporaryOverride,
  shouldApplyManualAffiliationOverride,
  shouldApplyManualTierOverride,
  shouldApplyManualRaceOverride,
} = require("./lib/roster-admin-store");

function runTest(name, fn) {
  try {
    fn();
    console.log(`PASS ${name}`);
  } catch (error) {
    console.error(`FAIL ${name}`);
    throw error;
  }
}

const temporaryOverride = {
  entity_id: "eloboard:male:671",
  name: "쌍디",
  team_code: "fa",
  tier: "6",
  race: "Zerg",
  manual_lock: true,
  manual_mode: "temporary",
};

runTest("temporary override matching eloboard is released", () => {
  const verdict = evaluateTemporaryOverrideAgainstObserved(temporaryOverride, {
    team_code: "fa",
    tier: "6",
    race: "Zerg",
  });
  assert.equal(verdict && verdict.action, "release");
});

runTest("comparison is case/whitespace tolerant", () => {
  const verdict = evaluateTemporaryOverrideAgainstObserved(temporaryOverride, {
    team_code: "FA ",
    tier: " 6",
    race: "zerg",
  });
  assert.equal(verdict && verdict.action, "release");
});

runTest("temporary override differing from eloboard reports mismatch with diffs only", () => {
  const verdict = evaluateTemporaryOverrideAgainstObserved(temporaryOverride, {
    team_code: "ssg",
    tier: "6",
    race: "Zerg",
  });
  assert.equal(verdict && verdict.action, "mismatch");
  assert.equal(verdict.reason, "eloboard_differs");
  assert.deepEqual(verdict.fields, [{ field: "team_code", manual: "fa", observed: "ssg" }]);
});

runTest("player missing from eloboard reports not_on_eloboard mismatch", () => {
  const verdict = evaluateTemporaryOverrideAgainstObserved(temporaryOverride, null);
  assert.equal(verdict && verdict.action, "mismatch");
  assert.equal(verdict.reason, "not_on_eloboard");
});

runTest("fixed overrides (YB) are never evaluated", () => {
  const fixedRow = { ...temporaryOverride, manual_mode: "fixed" };
  assert.equal(isReleasableTemporaryOverride(fixedRow), false);
  assert.equal(evaluateTemporaryOverrideAgainstObserved(fixedRow, { team_code: "fa", tier: "6", race: "Zerg" }), null);
});

runTest("identity mapping overrides (legacy_entity_ids) are never evaluated", () => {
  const identityRow = {
    ...temporaryOverride,
    manual_mode: "temporary",
    legacy_entity_ids: ["eloboard:female:703"],
  };
  assert.equal(evaluateTemporaryOverrideAgainstObserved(identityRow, { team_code: "fa", tier: "6", race: "Zerg" }), null);
});

runTest("retired and non-temporary overrides are never evaluated", () => {
  assert.equal(evaluateTemporaryOverrideAgainstObserved({ ...temporaryOverride, retired: true }, {}), null);
  assert.equal(evaluateTemporaryOverrideAgainstObserved({ ...temporaryOverride, manual_mode: undefined }, {}), null);
});

runTest("released (neutralized) override rows carry no applicable correction", () => {
  const neutralized = {
    entity_id: temporaryOverride.entity_id,
    name: temporaryOverride.name,
    team_code: undefined,
    tier: undefined,
    race: undefined,
    manual_lock: false,
    manual_mode: undefined,
    note: "[auto-released 2026-07-19] eloboard matched manual correction",
    soop_id: "kept-from-local-file",
  };
  assert.equal(shouldApplyManualAffiliationOverride(neutralized), false);
  assert.equal(shouldApplyManualTierOverride(neutralized), false);
  assert.equal(shouldApplyManualRaceOverride(neutralized), false);
  assert.equal(evaluateTemporaryOverrideAgainstObserved(neutralized, { team_code: "fa" }), null);
});

console.log("roster-override-auto-release: all tests passed");
