const path = require("path");
const { spawn } = require("child_process");

const ROOT = path.resolve(__dirname, "..", "..");
const NODE_BIN = process.execPath || "node";
const REFRESH_SCRIPT = path.join(ROOT, "scripts", "tools", "refresh-soop-live-preview.js");
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

function runRefresh() {
  return new Promise((resolve) => {
    const child = spawn(NODE_BIN, [REFRESH_SCRIPT], {
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

  console.log(`[SOOP] watch started at ${nowLabel()}`);
  console.log(`[SOOP] interval: ${intervalSec}s`);
  console.log(`[SOOP] stop with Ctrl+C`);

  let running = false;

  const tick = async () => {
    if (running) return;
    running = true;
    console.log(`[SOOP] refresh start ${nowLabel()}`);
    const exitCode = await runRefresh();
    console.log(`[SOOP] refresh done ${nowLabel()} exit=${exitCode}`);
    running = false;
  };

  await tick();
  const timer = setInterval(tick, intervalMs);

  process.on("SIGINT", () => {
    clearInterval(timer);
    console.log("[SOOP] watch stopped");
    process.exit(0);
  });

  process.on("SIGTERM", () => {
    clearInterval(timer);
    console.log("[SOOP] watch stopped");
    process.exit(0);
  });
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
});
