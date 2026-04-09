const path = require("path");
const { spawn } = require("child_process");

const ROOT = path.resolve(__dirname, "..", "..");
const NODE_BIN = process.execPath || "node";
const GENERATE_SCRIPT = path.join(ROOT, "scripts", "tools", "generate-soop-live-snapshot.js");
const SUMMARY_SCRIPT = path.join(ROOT, "scripts", "tools", "report-soop-live-summary.js");
const DEFAULT_INTERVAL_SEC = 300;

function argValue(flag, fallback = "") {
  const index = process.argv.indexOf(flag);
  if (index >= 0 && process.argv[index + 1]) return process.argv[index + 1];
  return fallback;
}

function toNumber(value, fallback) {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

function nowLabel() {
  return new Date().toLocaleString("sv-SE", {
    timeZone: "Asia/Seoul",
    hour12: false,
  });
}

function runScript(scriptPath) {
  return new Promise((resolve) => {
    const child = spawn(NODE_BIN, [scriptPath], {
      cwd: ROOT,
      env: process.env,
      stdio: "inherit",
    });

    child.on("close", (code) => {
      resolve(typeof code === "number" ? code : 1);
    });

    child.on("error", () => {
      resolve(1);
    });
  });
}

async function main() {
  const intervalSec = toNumber(argValue("--interval-sec"), DEFAULT_INTERVAL_SEC);
  const intervalMs = intervalSec * 1000;

  console.log(`[SOOP snapshot] watch started at ${nowLabel()}`);
  console.log(`[SOOP snapshot] interval: ${intervalSec}s`);
  console.log(`[SOOP snapshot] stop with Ctrl+C`);

  let running = false;

  const tick = async () => {
    if (running) return;
    running = true;
    console.log(`[SOOP snapshot] generate start ${nowLabel()}`);
    const generateExitCode = await runScript(GENERATE_SCRIPT);
    console.log(`[SOOP snapshot] generate done ${nowLabel()} exit=${generateExitCode}`);
    if (generateExitCode === 0) {
      console.log(`[SOOP snapshot] summary start ${nowLabel()}`);
      const summaryExitCode = await runScript(SUMMARY_SCRIPT);
      console.log(`[SOOP snapshot] summary done ${nowLabel()} exit=${summaryExitCode}`);
    }
    running = false;
  };

  await tick();
  const timer = setInterval(tick, intervalMs);

  process.on("SIGINT", () => {
    clearInterval(timer);
    console.log("[SOOP snapshot] watch stopped");
    process.exit(0);
  });

  process.on("SIGTERM", () => {
    clearInterval(timer);
    console.log("[SOOP snapshot] watch stopped");
    process.exit(0);
  });
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
});
