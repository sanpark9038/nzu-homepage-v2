const assert = require("node:assert/strict");

const { describeAlertTone } = require("./send-manual-refresh-discord");

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
