const assert = require("node:assert/strict");

const {
  buildServingIdentityKey,
  tableHasColumn,
  withServingIdentityKey,
} = require("./serving-identity-key");

const tests = [];

function runTest(name, fn) {
  tests.push({ name, fn });
}

async function main() {
  for (const { name, fn } of tests) {
    try {
      await fn();
      console.log(`PASS ${name}`);
    } catch (error) {
      console.error(`FAIL ${name}`);
      throw error;
    }
  }
}

runTest("buildServingIdentityKey collapses mix and non-mix eloboard ids", () => {
  assert.equal(buildServingIdentityKey({ eloboard_id: "eloboard:male:913", gender: "male" }), "male:913");
  assert.equal(buildServingIdentityKey({ eloboard_id: "eloboard:male:mix:913", gender: "male" }), "male:913");
});

runTest("buildServingIdentityKey infers gender from eloboard id when row gender is missing", () => {
  assert.equal(buildServingIdentityKey({ eloboard_id: "eloboard:female:704" }), "female:704");
});

runTest("withServingIdentityKey only adds the column when enabled", () => {
  const row = { name: "player", eloboard_id: "eloboard:male:40", gender: "male" };

  assert.deepEqual(withServingIdentityKey(row, false), row);
  assert.deepEqual(withServingIdentityKey(row, true), {
    ...row,
    serving_identity_key: "male:40",
  });
});

runTest("tableHasColumn returns true only when a probe select succeeds", async () => {
  const okSupabase = {
    from(table) {
      assert.equal(table, "players");
      return {
        select(column) {
          assert.equal(column, "serving_identity_key");
          return {
            async limit(value) {
              assert.equal(value, 1);
              return { error: null };
            },
          };
        },
      };
    },
  };
  const missingSupabase = {
    from() {
      return {
        select() {
          return {
            async limit() {
              return { error: { code: "42703", message: "missing column" } };
            },
          };
        },
      };
    },
  };

  assert.equal(await tableHasColumn(okSupabase, "players", "serving_identity_key"), true);
  assert.equal(await tableHasColumn(missingSupabase, "players", "serving_identity_key"), false);
});

main().catch((error) => {
  console.error(error instanceof Error ? error.stack || error.message : String(error));
  process.exit(1);
});
