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
const EXCLUSIONS_PATH = path.join(
  ROOT,
  "data",
  "metadata",
  "pipeline_collection_exclusions.v1.json"
);

function argValue(flag, fallback = null) {
  const idx = process.argv.indexOf(flag);
  if (idx >= 0 && process.argv[idx + 1]) return process.argv[idx + 1];
  return fallback;
}

function hasFlag(flag) {
  return process.argv.includes(flag);
}

function asDate(value) {
  if (!value) return null;
  const d = new Date(String(value));
  if (!Number.isFinite(d.getTime())) return null;
  return d;
}

function daysBetween(a, b) {
  const ms = Math.abs(a.getTime() - b.getTime());
  return Math.floor(ms / (24 * 60 * 60 * 1000));
}

function shouldSkipByPriorityWindow(player, to) {
  const lastChecked = asDate(player && player.last_checked_at ? player.last_checked_at : "");
  const checkIntervalDays = Number(player && player.check_interval_days ? player.check_interval_days : 0) || 0;
  const todayDate = asDate(to) || new Date();
  if (!lastChecked || checkIntervalDays <= 0) return false;
  return daysBetween(todayDate, lastChecked) < checkIntervalDays;
}

function readPeriodMaxDate(jsonPath) {
  if (!fs.existsSync(jsonPath)) return null;
  try {
    const raw = fs.readFileSync(jsonPath, "utf8").replace(/^\uFEFF/, "");
    const doc = JSON.parse(raw);
    const p = Array.isArray(doc.players) ? doc.players[0] : null;
    if (!p) return null;
    return asDate(p.period_max_date || "");
  } catch {
    return null;
  }
}

function expectedExportCsvPath(playerName, teamCode) {
  const safeName = safeFileName(playerName);
  const direct = path.join(TMP_DIR, `${safeName}_상세전적.csv`);
  const teamScoped = path.join(TMP_DIR, "exports", String(teamCode || ""), "csv", `${safeName}_상세전적.csv`);
  if (fs.existsSync(teamScoped)) return teamScoped;
  return direct;
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
    maxBuffer: 50 * 1024 * 1024,
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

function readJsonIfExists(filePath, fallback) {
  if (!fs.existsSync(filePath)) return fallback;
  return JSON.parse(fs.readFileSync(filePath, "utf8").replace(/^\uFEFF/, ""));
}

function normalizeName(name) {
  return String(name || "").trim().toLowerCase();
}

function loadCollectionExclusions() {
  const doc = readJsonIfExists(EXCLUSIONS_PATH, { players: [] });
  const rows = Array.isArray(doc.players) ? doc.players : [];
  const normalizedRows = [];
  for (const row of rows) {
    const reason = String(row && row.reason ? row.reason : "excluded_from_collection");
    const entityId = String(row && row.entity_id ? row.entity_id : "").trim();
    const wrId = Number(row && row.wr_id);
    const name = normalizeName(row && row.name ? row.name : "");
    normalizedRows.push({
      reason,
      entity_id: entityId || null,
      wr_id: Number.isFinite(wrId) && wrId > 0 ? wrId : null,
      name: name || null,
    });
  }
  return normalizedRows;
}

function exclusionReason(player, exclusions) {
  const entityId = String(player && player.entity_id ? player.entity_id : "").trim();
  const wrId = Number(player && player.wr_id);
  const nameKey = normalizeName(player && player.name ? player.name : "");
  for (const rule of exclusions) {
    if (!rule || typeof rule !== "object") continue;
    if (rule.entity_id) {
      if (entityId && entityId === rule.entity_id) return rule.reason;
      continue;
    }
    if (rule.wr_id && rule.name) {
      if (Number.isFinite(wrId) && wrId === rule.wr_id && nameKey && nameKey === rule.name) {
        return rule.reason;
      }
      continue;
    }
    if (rule.wr_id) {
      if (Number.isFinite(wrId) && wrId === rule.wr_id) return rule.reason;
      continue;
    }
    if (rule.name) {
      if (nameKey && nameKey === rule.name) return rule.reason;
    }
  }
  return null;
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
  const inactiveSkipDays = Number(argValue("--inactive-skip-days", "0")) || 0;
  const reportPath = argValue(
    "--report-path",
    path.join(TMP_DIR, "nzu_roster_batch_export_report.json")
  );

  const rosterJson = JSON.parse(fs.readFileSync(rosterPath, "utf8").replace(/^\uFEFF/, ""));
  const teamName = argValue("--univ", rosterJson.team_name || "늪지대");
  const roster = Array.isArray(rosterJson.roster) ? rosterJson.roster : [];
  const players = limit > 0 ? roster.slice(0, limit) : roster;
  const exclusions = loadCollectionExclusions();

  const summary = {
    generated_at: new Date().toISOString(),
    team_name: teamName,
    source_roster: rosterPath,
    total_players: players.length,
    options: { limit, concurrency, from, to, useExisting, inactiveSkipDays },
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

    const excludedReason = exclusionReason(p, exclusions);
    if (excludedReason) {
      result.fetch_status = "excluded";
      result.csv_status = "excluded";
      result.json_path = null;
      result.excluded = true;
      result.exclude_reason = excludedReason;
      summary.results.push(result);
      console.log(`[SKIP] ${playerName} excluded (${excludedReason})`);
      continue;
    }

    try {
      let shouldFetch = true;
      if (useExisting && fs.existsSync(jsonPath)) {
        if (shouldSkipByPriorityWindow(p, to)) {
          shouldFetch = false;
          result.fetch_status = "used_existing_json_priority_window";
        } else if (inactiveSkipDays > 0) {
          const maxDate = readPeriodMaxDate(jsonPath);
          const todayDate = asDate(to) || new Date();
          if (maxDate && daysBetween(todayDate, maxDate) > inactiveSkipDays) {
            shouldFetch = false;
            result.fetch_status = "used_existing_json_inactive";
          } else {
            shouldFetch = true;
          }
        } else {
          shouldFetch = false;
          result.fetch_status = "used_existing_json";
        }
      }

      if (shouldFetch) {
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
      }

      const reusedJson = result.fetch_status === "used_existing_json" || result.fetch_status === "used_existing_json_inactive";
      if (reusedJson) {
        result.csv_path = expectedExportCsvPath(playerName, p.team_code);
        result.csv_status = "used_existing_csv";
      } else {
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
      }
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
