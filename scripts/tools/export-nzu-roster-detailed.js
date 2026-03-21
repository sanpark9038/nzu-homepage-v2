const fs = require("fs");
const path = require("path");
const { execFileSync } = require("child_process");
const { defaultProfileUrlForPlayer } = require("./lib/eloboard-special-cases");

const ROOT = path.resolve(__dirname, "..", "..");
const DEFAULT_ROSTER_PATH = path.join(
  ROOT,
  "data",
  "metadata",
  "projects",
  "nzu",
  "players.nzu.v1.json"
);
const REPORT_SCRIPT = path.join(ROOT, "scripts", "tools", "report-nzu-2025-records.js");
const CSV_SCRIPT = path.join(ROOT, "scripts", "tools", "export-player-matches-csv.js");
const TMP_DIR = path.join(ROOT, "tmp");

function argValue(flag, fallback = null) {
  const idx = process.argv.indexOf(flag);
  if (idx >= 0 && process.argv[idx + 1]) return process.argv[idx + 1];
  return fallback;
}

function hasFlag(flag) {
  return process.argv.includes(flag);
}

function writeJson(filePath, obj) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, JSON.stringify(obj, null, 2), "utf8");
}

function runNode(scriptPath, args) {
  return execFileSync("node", [scriptPath, ...args], {
    cwd: ROOT,
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
  });
}

function safeFileName(name) {
  return String(name).replace(/[<>:"/\\|?*\x00-\x1F]/g, "_");
}

function defaultProfileUrl(player) {
  return defaultProfileUrlForPlayer(player);
}

function firstPeriodTotal(parsed) {
  if (!parsed || !Array.isArray(parsed.players) || parsed.players.length === 0) return null;
  const total = Number(parsed.players[0]?.period_total);
  return Number.isFinite(total) ? total : null;
}

function main() {
  const rosterPath = argValue("--roster-path", DEFAULT_ROSTER_PATH);
  if (!fs.existsSync(rosterPath)) {
    throw new Error(`Missing roster metadata file: ${rosterPath}`);
  }

  const limit = Number(argValue("--limit", "0")) || 0;
  const concurrency = String(argValue("--concurrency", "1"));
  const from = argValue("--from", "2025-01-01");
  const to = argValue("--to", new Date().toISOString().slice(0, 10));
  const useExisting = hasFlag("--use-existing-json");
  const reportPath = argValue(
    "--report-path",
    path.join(TMP_DIR, "nzu_roster_batch_export_report.json")
  );

  const rosterJson = JSON.parse(fs.readFileSync(rosterPath, "utf8").replace(/^\uFEFF/, ""));
  const teamName = argValue("--univ", rosterJson.team_name || "늪지대");
  const roster = Array.isArray(rosterJson.roster) ? rosterJson.roster : [];
  const players = limit > 0 ? roster.slice(0, limit) : roster;

  const summary = {
    generated_at: new Date().toISOString(),
    team_name: teamName,
    source_roster: rosterPath,
    total_players: players.length,
    options: { limit, concurrency, from, to, useExisting },
    results: [],
  };

  for (const p of players) {
    const playerName = p.name;
    const safeName = safeFileName(playerName);
    const jsonPath = path.join(TMP_DIR, `${teamName}_${safeName}_matches.json`);
    const result = {
      player: playerName,
      wr_id: p.wr_id,
      json_path: jsonPath,
      csv_path: null,
      fetch_status: "skipped",
      csv_status: "skipped",
      error: null,
    };

    try {
      if (!useExisting || !fs.existsSync(jsonPath)) {
        let raw = runNode(REPORT_SCRIPT, [
          "--json-only",
          "--include-matches",
          "--univ",
          teamName,
          "--player",
          playerName,
          "--concurrency",
          concurrency,
        ]);
        let parsed = JSON.parse(raw);

        // Fallback: if player is not found in current roster page, fetch directly by profile URL.
        const noPlayerHit =
          !parsed ||
          !Array.isArray(parsed.players) ||
          parsed.players.length === 0;
        if (noPlayerHit && p.wr_id && p.gender) {
          const profileUrl = defaultProfileUrl(p);
          raw = runNode(REPORT_SCRIPT, [
            "--json-only",
            "--include-matches",
            "--univ",
            teamName,
            "--player",
            playerName,
            "--profile-url",
            profileUrl,
            "--wr-id",
            String(p.wr_id),
            "--gender",
            String(p.gender),
            "--tier",
            String(p.tier || ""),
            "--concurrency",
            concurrency,
          ]);
          parsed = JSON.parse(raw);
        }

        // Guardrail: when collection unexpectedly returns 0, retry once with no-cache.
        // This prevents transient empty responses from being persisted as final output.
        if (firstPeriodTotal(parsed) === 0 && p.wr_id && p.gender) {
          const profileUrl = defaultProfileUrl(p);
          raw = runNode(REPORT_SCRIPT, [
            "--json-only",
            "--include-matches",
            "--no-cache",
            "--univ",
            teamName,
            "--player",
            playerName,
            "--profile-url",
            profileUrl,
            "--wr-id",
            String(p.wr_id),
            "--gender",
            String(p.gender),
            "--tier",
            String(p.tier || ""),
            "--concurrency",
            concurrency,
          ]);
          parsed = JSON.parse(raw);
        }
        writeJson(jsonPath, parsed);
        result.fetch_status = "ok";
      } else {
        result.fetch_status = "used_existing_json";
      }

      const csvOutput = runNode(CSV_SCRIPT, [
        "--univ",
        teamName,
        "--player",
        playerName,
        "--stable-name",
        "--from",
        from,
        "--to",
        to,
      ]).trim();

      result.csv_path = csvOutput;
      result.csv_status = "ok";
    } catch (err) {
      result.error = err instanceof Error ? err.message : String(err);
      if (result.fetch_status === "skipped") result.fetch_status = "failed";
      if (result.csv_status === "skipped") result.csv_status = "failed";
    }

    summary.results.push(result);
    const icon = result.error ? "FAIL" : "OK";
    console.log(`[${icon}] ${playerName} fetch=${result.fetch_status} csv=${result.csv_status}`);
  }

  writeJson(reportPath, summary);
  console.log(`report: ${reportPath}`);
}

main();
