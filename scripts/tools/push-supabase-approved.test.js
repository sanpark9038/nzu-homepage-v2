const assert = require("node:assert/strict");

const {
  buildPlayerHistoryProdSyncEnv,
  checkSupabaseReadiness,
  formatSupabaseReadinessError,
  hasSoopSnapshotEnv,
  parsePlayerHistoryArtifactResult,
} = require("./push-supabase-approved");

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

async function runAsyncTest(name, fn) {
  try {
    await fn();
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

runTest("Supabase readiness errors expand Cloudflare HTML instead of object Object", () => {
  const actual = formatSupabaseReadinessError({
    code: "",
    message: "",
    details:
      "<!DOCTYPE html><html><head><title>supabase.co | 522: Connection timed out</title></head><body>Cloudflare</body></html>",
  });

  assert.match(actual, /522/);
  assert.match(actual, /Connection timed out/);
  assert.doesNotMatch(actual, /^\[object Object\]$/);
});

runTest("player history artifact result enables recent Supabase history projection only after public upload", () => {
  const result = parsePlayerHistoryArtifactResult({
    ok: true,
    out: JSON.stringify({
      r2: {
        public_base_url: "https://history.example.com/player-history",
      },
    }),
  });

  assert.equal(result.publicBaseUrl, "https://history.example.com/player-history");
  assert.deepEqual(
    buildPlayerHistoryProdSyncEnv({
      artifactResult: result,
      env: { SUPABASE_MATCH_HISTORY_LIMIT: "50" },
    }),
    {
      PLAYER_HISTORY_ARTIFACTS_ENABLED: "true",
      PLAYER_HISTORY_PUBLIC_BASE_URL: "https://history.example.com/player-history",
      SUPABASE_MATCH_HISTORY_LIMIT: "50",
    }
  );
});

runTest("player history artifact result leaves Supabase history full when upload is skipped", () => {
  const result = parsePlayerHistoryArtifactResult({
    ok: true,
    out: JSON.stringify({
      r2: {
        skipped: true,
        reason: "missing_r2_env",
      },
    }),
  });

  assert.equal(result.publicBaseUrl, "");
  assert.deepEqual(buildPlayerHistoryProdSyncEnv({ artifactResult: result, env: {} }), {});
});

(async () => {
  await runAsyncTest("Supabase readiness check fails closed on read-only query errors", async () => {
    const result = await checkSupabaseReadiness({
      env: {
        NEXT_PUBLIC_SUPABASE_URL: "https://example.supabase.co",
        SUPABASE_SERVICE_ROLE_KEY: "service-key",
      },
      maxAttempts: 1,
      client: {
        from() {
          return {
            async select() {
              return {
                count: null,
                error: {
                  details:
                    "<!DOCTYPE html><html><head><title>supabase.co | 521: Web server is down</title></head></html>",
                },
              };
            },
          };
        },
      },
    });

    assert.equal(result.ready, false);
    assert.equal(result.reason, "readiness_query_failed");
    assert.match(result.detail, /521/);
    assert.match(result.detail, /Web server is down/);
  });
})().catch((error) => {
  console.error(error instanceof Error ? error.stack || error.message : String(error));
  process.exit(1);
});
