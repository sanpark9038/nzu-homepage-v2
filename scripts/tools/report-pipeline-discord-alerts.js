const fs = require("fs");
const path = require("path");

const ROOT = path.resolve(__dirname, "..", "..");
const ALERTS_PATH = path.join(ROOT, "data", "metadata", "pipeline_discord_alerts.v1.json");

function readDiscordAlertsDoc() {
  return JSON.parse(fs.readFileSync(ALERTS_PATH, "utf8").replace(/^\uFEFF/, ""));
}

function summarizeDiscordAlerts(doc) {
  const channels = Array.isArray(doc.channels) ? doc.channels : [];
  return {
    generated_at: new Date().toISOString(),
    alerts_path: ALERTS_PATH,
    version: doc.version || null,
    channel_count: channels.length,
    message_type_count: channels.reduce(
      (acc, channel) => acc + (Array.isArray(channel.message_types) ? channel.message_types.length : 0),
      0
    ),
    channels: channels.map((channel) => ({
      id: channel.id,
      entrypoint: channel.entrypoint || null,
      trigger_count: Array.isArray(channel.triggered_by) ? channel.triggered_by.length : 0,
      message_type_count: Array.isArray(channel.message_types) ? channel.message_types.length : 0,
    })),
    blocking_severities: Array.isArray(doc.alert_rule_relationship && doc.alert_rule_relationship.current_blocking_severities)
      ? doc.alert_rule_relationship.current_blocking_severities
      : [],
  };
}

function main() {
  const summary = summarizeDiscordAlerts(readDiscordAlertsDoc());
  console.log(JSON.stringify(summary, null, 2));
}

if (require.main === module) {
  main();
}

module.exports = {
  ALERTS_PATH,
  readDiscordAlertsDoc,
  summarizeDiscordAlerts,
};
