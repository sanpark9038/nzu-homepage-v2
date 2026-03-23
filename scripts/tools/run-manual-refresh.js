const fs = require("fs");
const path = require("path");
const { spawnSync } = require("child_process");

const ROOT = path.resolve(__dirname, "..", "..");
const NODE_BIN = process.execPath || "node";
const PROJECTS_DIR = path.join(ROOT, "data", "metadata", "projects");
const REPORTS_DIR = path.join(ROOT, "tmp", "reports");
const BASELINE_PATH = path.join(REPORTS_DIR, "manual_refresh_baseline.json");

function ensureDir(dirPath) {
  fs.mkdirSync(dirPath, { recursive: true });
}

function readJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, "utf8").replace(/^\uFEFF/, ""));
}

function captureRosterBaseline() {
  ensureDir(REPORTS_DIR);
  const teams = [];
  if (!fs.existsSync(PROJECTS_DIR)) {
    fs.writeFileSync(
      BASELINE_PATH,
      JSON.stringify({ generated_at: new Date().toISOString(), teams }, null, 2),
      "utf8"
    );
    return;
  }

  const dirs = fs
    .readdirSync(PROJECTS_DIR, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => entry.name)
    .sort((a, b) => String(a).localeCompare(String(b)));

  for (const code of dirs) {
    const filePath = path.join(PROJECTS_DIR, code, `players.${code}.v1.json`);
    if (!fs.existsSync(filePath)) continue;
    const doc = readJson(filePath);
    const roster = Array.isArray(doc.roster) ? doc.roster : [];
    teams.push({
      team_code: String(doc.team_code || code),
      team_name: String(doc.team_name || code),
      players: roster.map((player) => ({
        entity_id: String(player.entity_id || ""),
        name: String(player.name || ""),
        display_name: String(player.display_name || player.name || ""),
        team_code: String(player.team_code || doc.team_code || code),
        team_name: String(player.team_name || doc.team_name || code),
        tier: String(player.tier || ""),
        last_changed_at: player.last_changed_at || null,
      })),
    });
  }

  fs.writeFileSync(
    BASELINE_PATH,
    JSON.stringify(
      {
        generated_at: new Date().toISOString(),
        teams,
      },
      null,
      2
    ),
    "utf8"
  );
}

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
  captureRosterBaseline();
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
