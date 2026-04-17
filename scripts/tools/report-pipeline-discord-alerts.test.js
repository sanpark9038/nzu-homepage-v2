const assert = require("node:assert/strict");

const { readDiscordAlertsDoc, summarizeDiscordAlerts } = require("./report-pipeline-discord-alerts");

function runTest(name, fn) {
  try {
    fn();
    console.log(`PASS ${name}`);
  } catch (error) {
    console.error(`FAIL ${name}`);
    throw error;
  }
}

runTest("discord alerts doc has channels", () => {
  const doc = readDiscordAlertsDoc();
  assert.equal(Array.isArray(doc.channels), true);
  assert.equal(doc.channels.length > 0, true);
});

runTest("discord alerts summary exposes message types and blocking severities", () => {
  const summary = summarizeDiscordAlerts(readDiscordAlertsDoc());
  assert.equal(summary.channel_count > 0, true);
  assert.equal(summary.message_type_count > 0, true);
  assert.equal(Array.isArray(summary.blocking_severities), true);
});
