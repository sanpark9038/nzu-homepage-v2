const path = require("path");
const { spawnSync } = require("child_process");
const { createClient } = require("@supabase/supabase-js");
require("dotenv").config({ path: path.join(__dirname, "..", "..", ".env.local") });

const ROOT = path.resolve(__dirname, "..", "..");
const NODE_BIN = process.execPath || "node";
const DEFAULT_PLAYER_HISTORY_LIMIT = "100";

function hasFlag(flag) {
  return process.argv.includes(flag);
}

function logCacheRevalidationResult(result) {
  console.log(`CACHE_REVALIDATION_RESULT ${JSON.stringify(result)}`);
}

function parseJsonFromStepOutput(output) {
  const text = String(output || "").trim();
  if (!text) return null;
  try {
    return JSON.parse(text);
  } catch {}
  const start = text.indexOf("{");
  const end = text.lastIndexOf("}");
  if (start < 0 || end <= start) return null;
  try {
    return JSON.parse(text.slice(start, end + 1));
  } catch {
    return null;
  }
}

function parsePlayerHistoryArtifactResult(step) {
  const parsed = step && step.ok ? parseJsonFromStepOutput(step.out) : null;
  const publicBaseUrl = String(parsed && parsed.r2 && parsed.r2.public_base_url ? parsed.r2.public_base_url : "").trim();
  return {
    ok: Boolean(step && step.ok),
    publicBaseUrl,
    skipped: Boolean(parsed && parsed.r2 && parsed.r2.skipped),
    reason: String(parsed && parsed.r2 && parsed.r2.reason ? parsed.r2.reason : "").trim() || null,
  };
}

function buildPlayerHistoryProdSyncEnv({ artifactResult, env = process.env } = {}) {
  const publicBaseUrl = String(artifactResult && artifactResult.publicBaseUrl ? artifactResult.publicBaseUrl : "").trim();
  if (!publicBaseUrl) return {};
  return {
    PLAYER_HISTORY_ARTIFACTS_ENABLED: "true",
    PLAYER_HISTORY_PUBLIC_BASE_URL: publicBaseUrl,
    SUPABASE_MATCH_HISTORY_LIMIT: String(env.SUPABASE_MATCH_HISTORY_LIMIT || DEFAULT_PLAYER_HISTORY_LIMIT).trim() || DEFAULT_PLAYER_HISTORY_LIMIT,
  };
}

function summarizeErrorText(value) {
  const raw = String(value || "").trim();
  if (!raw) return "";
  const titleMatch = raw.match(/<title[^>]*>([\s\S]*?)<\/title>/i);
  const text = (titleMatch ? titleMatch[1] : raw)
    .replace(/<[^>]+>/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  return text.length > 800 ? `${text.slice(0, 800)}...` : text;
}

function formatSupabaseReadinessError(error) {
  if (!error) return "unknown Supabase readiness error";
  if (error instanceof Error) return error.stack || error.message || "unknown Supabase readiness error";
  if (typeof error !== "object") return summarizeErrorText(error) || String(error);

  const parts = [];
  for (const key of ["code", "message", "details", "hint"]) {
    const text = summarizeErrorText(error[key]);
    if (text) parts.push(`${key}=${text}`);
  }
  if (!parts.length) {
    try {
      const json = JSON.stringify(error);
      if (json && json !== "{}") parts.push(json);
    } catch {}
  }
  return parts.length ? parts.join(" | ") : "unknown Supabase readiness error";
}

function hasSoopSnapshotEnv() {
  return Boolean(String(process.env.SOOP_CLIENT_ID || "").trim());
}

function resolveSupabaseSyncEnv(env = process.env) {
  const supabaseUrl = String(env.NEXT_PUBLIC_SUPABASE_URL || "").trim();
  const serviceKey = String(env.SUPABASE_SERVICE_ROLE_KEY || env.SUPABASE_SERVICE_KEY || "").trim();
  return { supabaseUrl, serviceKey };
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function checkSupabaseReadiness(options = {}) {
  const env = options.env || process.env;
  const maxAttempts = Math.max(1, Number(options.maxAttempts || 3));
  const baseDelayMs = Math.max(0, Number(options.baseDelayMs ?? 1000));
  const { supabaseUrl, serviceKey } = resolveSupabaseSyncEnv(env);
  if (!supabaseUrl || !serviceKey) {
    return {
      ready: false,
      reason: "missing_supabase_env",
      detail: "NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY or SUPABASE_SERVICE_KEY are required",
      attempts: 0,
    };
  }

  const client =
    options.client ||
    createClient(supabaseUrl, serviceKey, {
      auth: {
        persistSession: false,
        autoRefreshToken: false,
      },
    });
  let lastError = null;

  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    try {
      const result = await client.from("players").select("id", { count: "exact", head: true });
      if (!result || !result.error) {
        return {
          ready: true,
          reason: null,
          detail: null,
          attempts: attempt,
          count: result ? result.count ?? null : null,
        };
      }
      lastError = result.error;
    } catch (error) {
      lastError = error;
    }

    if (attempt < maxAttempts && baseDelayMs > 0) {
      await sleep(baseDelayMs * attempt);
    }
  }

  return {
    ready: false,
    reason: "readiness_query_failed",
    detail: formatSupabaseReadinessError(lastError),
    attempts: maxAttempts,
  };
}

function runStep(name, scriptRelPath, args = [], options = {}) {
  const res = spawnSync(NODE_BIN, [scriptRelPath, ...args], {
    cwd: ROOT,
    env: {
      ...process.env,
      ...(options.env || {}),
    },
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
    maxBuffer: 64 * 1024 * 1024,
  });
  const ok = res.status === 0;
  const out = String(res.stdout || "").trim();
  const err = String(res.stderr || "").trim();
  if (!ok) {
    if (options.allowFailure) {
      console.warn(`[WARN] ${name}`);
      if (out) console.warn(out);
      if (err) console.warn(err);
      return {
        ok: false,
        out,
        err,
      };
    }
    console.error(`[FAIL] ${name}`);
    if (out) console.error(out);
    if (err) console.error(err);
    process.exit(1);
  }
  console.log(`[OK] ${name}`);
  if (out) console.log(out);
  return {
    ok: true,
    out,
    err,
  };
}

async function main() {
  if (!hasFlag("--approved")) {
    console.error(
      "Blocked: production sync requires explicit approval.\n" +
        "Run with: node scripts/tools/push-supabase-approved.js --approved"
    );
    process.exit(1);
  }

  if (hasSoopSnapshotEnv()) {
    runStep("soop_live_snapshot_before_supabase_sync", "scripts/tools/generate-soop-live-snapshot.js");
  } else {
    console.warn("[SKIP] soop_live_snapshot_before_supabase_sync missing SOOP_CLIENT_ID");
  }

  const readiness = await checkSupabaseReadiness();
  if (!readiness.ready) {
    console.error(
      `[FAIL] supabase_readiness_check ${readiness.reason}: ${readiness.detail || "unknown"}`
    );
    process.exit(1);
  }
  console.log(
    `[OK] supabase_readiness_check attempts=${readiness.attempts} players_count=${readiness.count ?? "unknown"}`
  );

  const playerHistoryStep = runStep(
    "player_history_artifacts",
    "scripts/tools/export-player-history-artifacts.js",
    ["--upload-r2-if-configured"],
    { allowFailure: true }
  );
  const playerHistoryResult = parsePlayerHistoryArtifactResult(playerHistoryStep);
  if (playerHistoryResult.publicBaseUrl) {
    console.log(`[OK] player_history_artifacts public_base_url=${playerHistoryResult.publicBaseUrl}`);
  } else {
    console.warn(
      `[WARN] player_history_artifacts not enabling recent Supabase projection (${playerHistoryResult.reason || "no_public_upload"})`
    );
  }

  runStep("supabase_staging_sync", "scripts/tools/supabase-staging-sync.js");
  runStep("supabase_prod_sync", "scripts/tools/supabase-prod-sync.js", [], {
    env: buildPlayerHistoryProdSyncEnv({
      artifactResult: playerHistoryResult,
      env: process.env,
    }),
  });
  const revalidate = runStep("revalidate_public_cache", "scripts/tools/revalidate-public-cache.js", [], {
    allowFailure: true,
  });
  if (!revalidate) {
    logCacheRevalidationResult({
      status: "unknown",
      reason: "missing_step_result",
    });
  } else if (revalidate.ok) {
    logCacheRevalidationResult({
      status: "completed",
    });
  } else {
    const stderr = String(revalidate.err || "").trim();
    const stdout = String(revalidate.out || "").trim();
    const combined = stderr || stdout;
    const skipMatch = combined.match(/\[SKIP\]\s+revalidate_public_cache\s+missing\s+(.+)$/m);
    if (skipMatch) {
      logCacheRevalidationResult({
        status: "skipped",
        reason: `missing_${String(skipMatch[1] || "").trim().replace(/,\s*/g, "_and_")}`,
      });
    } else {
      logCacheRevalidationResult({
        status: "failed",
        reason: combined.split(/\r?\n/).filter(Boolean).slice(-1)[0] || "unknown_error",
      });
    }
  }
  console.log("Done: Supabase staging+prod sync completed.");
}

if (require.main === module) {
  main().catch((error) => {
    console.error(error instanceof Error ? error.stack || error.message : String(error));
    process.exit(1);
  });
}

module.exports = {
  buildPlayerHistoryProdSyncEnv,
  checkSupabaseReadiness,
  formatSupabaseReadinessError,
  hasSoopSnapshotEnv,
  logCacheRevalidationResult,
  parsePlayerHistoryArtifactResult,
};
