const path = require("path");
const { spawnSync } = require("child_process");

const ROOT = path.resolve(__dirname, "..", "..");
const NODE_BIN = process.execPath || "node";

function runStep(name, scriptRelPath, args = []) {
  const startedAt = new Date().toISOString();
  console.log(`[RUN] ${name}`);
  const res = spawnSync(NODE_BIN, [scriptRelPath, ...args], {
    cwd: ROOT,
    encoding: "utf8",
    stdio: "inherit",
    maxBuffer: 64 * 1024 * 1024,
  });
  const endedAt = new Date().toISOString();
  if (res.status !== 0) {
    throw new Error(`${name} failed (exit=${res.status}) ${startedAt} -> ${endedAt}`);
  }
  console.log(`[OK] ${name}`);
}

function main() {
  runStep("collect_chunked", "scripts/tools/run-ops-pipeline-chunked.js", [
    "--chunk-size",
    "3",
    "--inactive-skip-days",
    "14",
  ]);
  runStep("supabase_push", "scripts/tools/push-supabase-approved.js", ["--approved"]);
  console.log("Done: manual refresh completed.");
}

main();
