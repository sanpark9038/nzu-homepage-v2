const assert = require("node:assert/strict");

const { hasSoopSnapshotEnv } = require("./push-supabase-approved");

function withTemporaryEnv(overrides, fn) {
  const previous = new Map();
  for (const [key, value] of Object.entries(overrides)) {
    previous.set(key, Object.prototype.hasOwnProperty.call(process.env, key) ? process.env[key] : undefined);
    if (value === undefined) {
      delete process.env[key];
    } else {
      process.env[key] = value;
    }
  }

  try {
    return fn();
  } finally {
    for (const [key, value] of previous.entries()) {
      if (value === undefined) {
        delete process.env[key];
      } else {
        process.env[key] = value;
      }
    }
  }
}

function runTest(name, fn) {
  try {
    fn();
    console.log(`PASS ${name}`);
  } catch (error) {
    console.error(`FAIL ${name}`);
    throw error;
  }
}

runTest("Supabase push refreshes SOOP snapshot only when SOOP env is available", () => {
  withTemporaryEnv({ SOOP_CLIENT_ID: undefined }, () => {
    assert.equal(hasSoopSnapshotEnv(), false);
  });

  withTemporaryEnv({ SOOP_CLIENT_ID: "client-id" }, () => {
    assert.equal(hasSoopSnapshotEnv(), true);
  });
});
