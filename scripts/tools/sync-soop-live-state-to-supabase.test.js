const assert = require("node:assert/strict");

process.env.NEXT_PUBLIC_SUPABASE_URL ||= "https://example.supabase.co";
process.env.SUPABASE_SERVICE_ROLE_KEY ||= "test-service-role-key";

const {
  buildUpdatePayloads,
  resolveSoopIdForPlayer,
} = require("./sync-soop-live-state-to-supabase");

function runTest(name, fn) {
  try {
    fn();
    console.log(`PASS ${name}`);
  } catch (error) {
    console.error(`FAIL ${name}`);
    throw error;
  }
}

runTest("resolveSoopIdForPlayer clears contaminated direct soop_id for durable identities", () => {
  const yuzuPayload = { soop_id: "yuzzzz" };
  const soopLookup = {
    lookup: new Map([["1024:female", yuzuPayload]]),
    byWrId: new Map([["1024", yuzuPayload]]),
    byNameGender: new Map([["히요코:female", yuzuPayload]]),
    byName: new Map([["히요코", yuzuPayload]]),
  };

  assert.equal(
    resolveSoopIdForPlayer(
      {
        name: "히요코",
        eloboard_id: "eloboard:female:889",
        gender: "female",
        soop_id: "yuzzzz",
      },
      soopLookup
    ),
    ""
  );
  assert.equal(
    resolveSoopIdForPlayer(
      {
        name: "유즈",
        eloboard_id: "eloboard:female:1024",
        gender: "female",
        soop_id: "yuzzzz",
      },
      soopLookup
    ),
    "yuzzzz"
  );
});

runTest("buildUpdatePayloads does not preserve stale soop_id when durable resolution fails", () => {
  const { updates } = buildUpdatePayloads(
    [
      {
        id: "player-1",
        name: "히요코",
        eloboard_id: "eloboard:female:889",
        gender: "female",
        soop_id: "yuzzzz",
      },
    ],
    { channels: { yuzzzz: { isLive: true, title: "live" } } },
    {
      lookup: new Map(),
      byWrId: new Map(),
      byNameGender: new Map([["히요코:female", { soop_id: "yuzzzz" }]]),
      byName: new Map([["히요코", { soop_id: "yuzzzz" }]]),
    }
  );

  assert.equal(updates[0].soop_id, null);
  assert.equal(updates[0].is_live, false);
});
