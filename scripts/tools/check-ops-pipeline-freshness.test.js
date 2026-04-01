const assert = require("assert/strict");

const { evaluateSummary } = require("./check-ops-pipeline-freshness");

function runTest(name, fn) {
  try {
    fn();
    console.log(`PASS ${name}`);
  } catch (error) {
    console.error(`FAIL ${name}`);
    console.error(error instanceof Error ? error.stack : String(error));
    process.exitCode = 1;
  }
}

runTest("evaluateSummary accepts fresh successful GitHub run", () => {
  const actual = evaluateSummary(
    {
      latest_path: ".github/workflows/ops-pipeline-cache.yml",
      latest_generated_at: "2026-03-31T22:51:48Z",
      latest_status: "completed",
      latest_conclusion: "success",
      latest_discord_summary_step: "Send Discord summary",
      latest_discord_summary_step_status: "success",
    },
    "2026-04-01",
    "06:10"
  );

  assert.equal(actual.ok, true);
  assert.equal(actual.reason, "fresh_and_pass");
});

runTest("evaluateSummary rejects stale remote run date", () => {
  const actual = evaluateSummary(
    {
      latest_path: ".github/workflows/ops-pipeline-cache.yml",
      latest_generated_at: "2026-03-30T22:51:48Z",
      latest_status: "completed",
      latest_conclusion: "success",
      latest_discord_summary_step: "Send Discord summary",
      latest_discord_summary_step_status: "success",
    },
    "2026-04-01",
    "06:10"
  );

  assert.equal(actual.ok, false);
  assert.match(actual.reason, /^stale_date /);
});

runTest("evaluateSummary rejects failed discord summary step", () => {
  const actual = evaluateSummary(
    {
      latest_path: ".github/workflows/ops-pipeline-cache.yml",
      latest_generated_at: "2026-03-31T22:51:48Z",
      latest_status: "completed",
      latest_conclusion: "success",
      latest_discord_summary_step: "Send Discord summary",
      latest_discord_summary_step_status: "failure",
    },
    "2026-04-01",
    "06:10"
  );

  assert.equal(actual.ok, false);
  assert.equal(actual.reason, "discord_step_failure");
});

if (process.exitCode) {
  process.exit(process.exitCode);
}
