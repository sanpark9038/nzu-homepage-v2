const path = require("path");
const { spawnSync } = require("child_process");

const ROOT = path.resolve(__dirname, "..", "..");
const NODE_BIN = process.execPath || "node";

function hasFlag(flag) {
  return process.argv.includes(flag);
}

function runStep(name, scriptRelPath) {
  const res = spawnSync(NODE_BIN, [scriptRelPath], {
    cwd: ROOT,
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
    maxBuffer: 64 * 1024 * 1024,
  });
  const ok = res.status === 0;
  const out = String(res.stdout || "").trim();
  const err = String(res.stderr || "").trim();
  if (!ok) {
    console.error(`[FAIL] ${name}`);
    if (out) console.error(out);
    if (err) console.error(err);
    process.exit(1);
  }
  console.log(`[OK] ${name}`);
  if (out) console.log(out);
}

function main() {
  if (!hasFlag("--approved")) {
    console.error(
      "Blocked: production sync requires explicit approval.\n" +
        "Run with: node scripts/tools/push-supabase-approved.js --approved"
    );
    process.exit(1);
  }

  runStep("supabase_staging_sync", "scripts/tools/supabase-staging-sync.js");
  runStep("supabase_prod_sync", "scripts/tools/supabase-prod-sync.js");
  console.log("Done: Supabase staging+prod sync completed.");
}

main();

