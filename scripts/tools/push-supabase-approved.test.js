const assert = require("node:assert/strict");

const {
  buildPlayerHistoryProdSyncEnv,
  cacheRevalidationResultFromStep,
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

runTest("approved push rebuilds and uploads warehouse aggregate serving snapshots before player history export", () => {
  const fs = require("node:fs");
  const path = require("node:path");
  const source = fs.readFileSync(path.join(__dirname, "push-supabase-approved.js"), "utf8");
  const aggregateBuildIndex = source.indexOf('"warehouse_aggregates"');
  const aggregateUploadIndex = source.indexOf('"warehouse_aggregate_r2_sync"');
  const playerHistoryIndex = source.indexOf('"player_history_artifacts"');

  assert.notEqual(aggregateBuildIndex, -1, "approved push should rebuild warehouse aggregates");
  assert.notEqual(aggregateUploadIndex, -1, "approved push should upload aggregate serving snapshots when configured");
  assert.notEqual(playerHistoryIndex, -1, "approved push should still export player history artifacts");
  assert.ok(
    aggregateBuildIndex < aggregateUploadIndex && aggregateUploadIndex < playerHistoryIndex,
    "warehouse aggregates should be rebuilt and uploaded before player history artifacts read fact_matches.csv"
  );
  assert.match(source, /sync-warehouse-aggregates\.js/);
  assert.match(source, /--upload-r2-if-configured/);
});

runTest("cache revalidation result reports skipped when the revalidation script skips env", () => {
  const actual = cacheRevalidationResultFromStep({
    ok: true,
    out: "[SKIP] revalidate_public_cache missing base_url, secret",
    err: "",
  });

  assert.deepEqual(actual, {
    status: "skipped",
    reason: "missing_base_url_and_secret",
  });
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
