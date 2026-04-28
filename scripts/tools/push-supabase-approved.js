const path = require("path");
const { spawnSync } = require("child_process");

const ROOT = path.resolve(__dirname, "..", "..");
const NODE_BIN = process.execPath || "node";

function hasFlag(flag) {
  return process.argv.includes(flag);
}

function logCacheRevalidationResult(result) {
  console.log(`CACHE_REVALIDATION_RESULT ${JSON.stringify(result)}`);
}

function hasSoopSnapshotEnv() {
  return Boolean(String(process.env.SOOP_CLIENT_ID || "").trim());
}

function runStep(name, scriptRelPath, args = [], options = {}) {
  const res = spawnSync(NODE_BIN, [scriptRelPath, ...args], {
    cwd: ROOT,
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

function main() {
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
  runStep("supabase_staging_sync", "scripts/tools/supabase-staging-sync.js");
  runStep("supabase_prod_sync", "scripts/tools/supabase-prod-sync.js");
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
  main();
}

module.exports = {
  hasSoopSnapshotEnv,
  logCacheRevalidationResult,
};
