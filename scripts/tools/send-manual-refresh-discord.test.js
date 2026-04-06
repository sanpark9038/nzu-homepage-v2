const assert = require("node:assert/strict");

const { describeAlertTone } = require("./send-manual-refresh-discord");
const { buildLegacyEntityIdLookup, buildPlayerKey, canonicalEntityId } = require("./lib/discord-summary");

function runTest(name, fn) {
  try {
    fn();
    console.log(`PASS ${name}`);
  } catch (error) {
    console.error(`FAIL ${name}`);
    throw error;
  }
}

runTest("describeAlertTone treats critical/high as warnings", () => {
  const actual = describeAlertTone({ critical: 0, high: 1, medium: 3, low: 0, total: 4 });
  assert.equal(actual.headlineSuffix, "(경고 포함)");
  assert.equal(actual.summaryLabel, "주의 알림");
  assert.equal(actual.isWarning, true);
});

runTest("describeAlertTone treats medium-only as operational notices", () => {
  const actual = describeAlertTone({ critical: 0, high: 0, medium: 13, low: 0, total: 13 });
  assert.equal(actual.headlineSuffix, "(변동 알림)");
  assert.equal(actual.summaryLabel, "변동 알림");
  assert.equal(actual.isWarning, false);
});

runTest("describeAlertTone stays neutral when no alerts exist", () => {
  const actual = describeAlertTone({ critical: 0, high: 0, medium: 0, low: 0, total: 0 });
  assert.equal(actual.headlineSuffix, "");
  assert.equal(actual.followup, "");
});

runTest("canonicalEntityId collapses legacy ids into the current manual-override id", () => {
  const lookup = buildLegacyEntityIdLookup([
    {
      entity_id: "eloboard:female:1028",
      legacy_entity_ids: ["eloboard:female:1026"],
    },
  ]);

  assert.equal(canonicalEntityId("eloboard:female:1026", lookup), "eloboard:female:1028");
  assert.equal(canonicalEntityId("eloboard:female:1028", lookup), "eloboard:female:1028");
});

runTest("buildPlayerKey treats legacy and successor entity ids as the same Discord summary identity", () => {
  const legacyLookup = buildLegacyEntityIdLookup([
    {
      entity_id: "eloboard:female:1028",
      legacy_entity_ids: ["eloboard:female:1026"],
    },
  ]);

  const baselineKey = buildPlayerKey({ entity_id: "eloboard:female:1026", name: "미진이" }, legacyLookup);
  const currentKey = buildPlayerKey({ entity_id: "eloboard:female:1028", name: "미진이" }, legacyLookup);

  assert.equal(baselineKey, currentKey);
});
