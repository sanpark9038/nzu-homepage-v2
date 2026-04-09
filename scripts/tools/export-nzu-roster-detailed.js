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
const RESUMES_PATH = path.join(
  ROOT,
  "data",
  "metadata",
  "pipeline_collection_resumes.v1.json"
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

function playerArtifactKey(player) {
  const entityId = String(player && player.entity_id ? player.entity_id : "").trim();
  if (entityId) return entityId.replace(/[<>:"/\\|?*\x00-\x1F]/g, "_");
  const wrId = Number(player && player.wr_id ? player.wr_id : 0);
  const gender = String(player && player.gender ? player.gender : "").trim() || "unknown";
  if (Number.isFinite(wrId) && wrId > 0) return `wr_${gender}_${wrId}`;
  return safeFileName(String(player && player.name ? player.name : "unknown_player"));
}

function playerJsonPath(teamName, player) {
  return path.join(TMP_DIR, `${teamName}_${playerArtifactKey(player)}_matches.json`);
}

function playerCsvPath(playerName, player) {
  return path.join(TMP_DIR, `${playerArtifactKey(player)}_${safeFileName(playerName)}_상세전적.csv`);
}

function expectedExportCsvPath(playerName, player) {
  const preferred = playerCsvPath(playerName, player);
  if (fs.existsSync(preferred)) return preferred;
  const safeName = safeFileName(playerName);
  const direct = path.join(TMP_DIR, `${safeName}_상세전적.csv`);
  const teamScoped = path.join(TMP_DIR, "exports", String(player && player.team_code ? player.team_code : ""), "csv", `${safeName}_상세전적.csv`);
  if (fs.existsSync(teamScoped)) return teamScoped;
  return direct;
}

function directReportArgs(teamName, playerName, player, extraFlags = []) {
  const profileUrl = defaultProfileUrl(player);
  const args = [
    "--json-only",
    "--include-matches",
    "--univ",
    teamName,
    "--player",
    playerName,
    "--profile-url",
    profileUrl,
    "--wr-id",
    String(player.wr_id),
    "--gender",
    String(player.gender || ""),
    "--tier",
    String(player.tier || ""),
    ...extraFlags,
  ];
  return args;
}

function writeJson(filePath, obj) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, JSON.stringify(obj, null, 2), "utf8");
}

function appendExportProgress(reportPath, event, payload = {}) {
  const dir = path.dirname(reportPath);
  const base = path.basename(reportPath, path.extname(reportPath));
  const progressPath = path.join(dir, `${base}.progress.jsonl`);
  fs.mkdirSync(dir, { recursive: true });
  fs.appendFileSync(
    progressPath,
    `${JSON.stringify({ ts: new Date().toISOString(), event, ...payload })}\n`,
    "utf8"
  );
}

function runNode(scriptPath, args, options = {}) {
  const timeoutMs = Number(options.timeoutMs || 300000);
  return execFileSync("node", [scriptPath, ...args], {
    cwd: ROOT,
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
    maxBuffer: 50 * 1024 * 1024,
    timeout: timeoutMs,
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

function readPeriodTotal(filePath) {
  if (!fs.existsSync(filePath)) return null;
  try {
    const parsed = JSON.parse(fs.readFileSync(filePath, "utf8").replace(/^\uFEFF/, ""));
    return firstPeriodTotal(parsed);
  } catch {
    return null;
  }
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

function loadCollectionResumes() {
  const doc = readJsonIfExists(RESUMES_PATH, { players: [] });
  const rows = Array.isArray(doc.players) ? doc.players : [];
  return rows.map((row) => ({
    entity_id: String(row && row.entity_id ? row.entity_id : "").trim() || null,
    wr_id: Number.isFinite(Number(row && row.wr_id)) ? Number(row.wr_id) : null,
    name: normalizeName(row && row.name ? row.name : "") || null,
  }));
}

function writeCollectionResumes(rows) {
  writeJson(RESUMES_PATH, {
    schema_version: "1.0.0",
    updated_at: new Date().toISOString(),
    description: "Players that should be forcibly recollected once after exclusion is cleared.",
    players: rows,
  });
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

function hasResumeMarker(player, resumes) {
  const entityId = String(player && player.entity_id ? player.entity_id : "").trim();
  const wrId = Number(player && player.wr_id);
  const nameKey = normalizeName(player && player.name ? player.name : "");
  return resumes.some((row) => {
    if (row.entity_id && entityId && row.entity_id === entityId) return true;
    if (Number.isFinite(row.wr_id) && Number.isFinite(wrId) && row.wr_id === wrId) return true;
    if (row.name && nameKey && row.name === nameKey) return true;
    return false;
  });
}

function clearResumeMarker(player, resumes) {
  const entityId = String(player && player.entity_id ? player.entity_id : "").trim();
  const wrId = Number(player && player.wr_id);
  const nameKey = normalizeName(player && player.name ? player.name : "");
  return resumes.filter((row) => {
    if (row.entity_id && entityId && row.entity_id === entityId) return false;
    if (Number.isFinite(row.wr_id) && Number.isFinite(wrId) && row.wr_id === wrId) return false;
    if (row.name && nameKey && row.name === nameKey) return false;
    return true;
  });
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
  let resumes = loadCollectionResumes();

  const summary = {
    generated_at: new Date().toISOString(),
    team_name: teamName,
    source_roster: rosterPath,
    total_players: players.length,
    options: { limit, concurrency, from, to, useExisting, inactiveSkipDays },
    results: [],
  };
  appendExportProgress(reportPath, "team_export_start", {
    team_name: teamName,
    roster_path: rosterPath,
    total_players: players.length,
  });

  for (const p of players) {
    const playerName = p.name;
    const jsonPath = playerJsonPath(teamName, p);
    const result = {
      player: playerName,
      entity_id: String(p.entity_id || ""),
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
      appendExportProgress(reportPath, "player_excluded", {
        player: playerName,
        wr_id: p.wr_id,
        reason: excludedReason,
      });
      console.log(`[SKIP] ${playerName} excluded (${excludedReason})`);
      continue;
    }

    try {
      appendExportProgress(reportPath, "player_start", {
        player: playerName,
        wr_id: p.wr_id,
        entity_id: String(p.entity_id || ""),
      });
      let shouldFetch = true;
      const forceRefresh = hasResumeMarker(p, resumes);
      if (forceRefresh) {
        result.fetch_status = "forced_recollect_after_resume";
      } else if (useExisting && fs.existsSync(jsonPath)) {
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
        const existingPeriodTotal = fs.existsSync(jsonPath) ? readPeriodTotal(jsonPath) : null;
        appendExportProgress(reportPath, "player_report_start", {
          player: playerName,
          wr_id: p.wr_id,
          no_cache: false,
        });
        let raw = runNode(REPORT_SCRIPT, directReportArgs(teamName, playerName, p, ["--concurrency", concurrency]), {
          timeoutMs: 240000,
        });
        let parsed = JSON.parse(raw);
        appendExportProgress(reportPath, "player_report_done", {
          player: playerName,
          wr_id: p.wr_id,
          period_total: firstPeriodTotal(parsed),
          no_cache: false,
        });

        // Guardrail: when collection unexpectedly returns 0, retry once with no-cache.
        // This prevents transient empty responses from being persisted as final output.
        if (firstPeriodTotal(parsed) === 0 && p.wr_id && p.gender) {
          appendExportProgress(reportPath, "player_report_start", {
            player: playerName,
            wr_id: p.wr_id,
            no_cache: true,
          });
          raw = runNode(
            REPORT_SCRIPT,
            directReportArgs(teamName, playerName, p, ["--no-cache", "--concurrency", concurrency]),
            { timeoutMs: 240000 }
          );
          parsed = JSON.parse(raw);
          appendExportProgress(reportPath, "player_report_done", {
            player: playerName,
            wr_id: p.wr_id,
            period_total: firstPeriodTotal(parsed),
            no_cache: true,
          });
        }
        const nextPeriodTotal = firstPeriodTotal(parsed);
        if (
          Number.isFinite(existingPeriodTotal) &&
          Number.isFinite(nextPeriodTotal) &&
          nextPeriodTotal < existingPeriodTotal
        ) {
          result.fetch_status = "used_existing_json_regression_guard";
          result.fetch_warning = `period_total_regressed:${existingPeriodTotal}->${nextPeriodTotal}`;
          appendExportProgress(reportPath, "player_report_regression_guard", {
            player: playerName,
            wr_id: p.wr_id,
            existing_period_total: existingPeriodTotal,
            next_period_total: nextPeriodTotal,
          });
        } else {
          writeJson(jsonPath, parsed);
          result.fetch_status = "ok";
        }
        if (forceRefresh) {
          resumes = clearResumeMarker(p, resumes);
          writeCollectionResumes(resumes);
        }
      }

      const reusedJson =
        result.fetch_status === "used_existing_json" ||
        result.fetch_status === "used_existing_json_inactive" ||
        result.fetch_status === "used_existing_json_regression_guard";
      if (reusedJson) {
        result.csv_path = expectedExportCsvPath(playerName, p);
        result.csv_status = "used_existing_csv";
      } else {
        appendExportProgress(reportPath, "player_csv_start", {
          player: playerName,
          wr_id: p.wr_id,
        });
        const csvOutput = runNode(CSV_SCRIPT, [
          "--report-path",
          jsonPath,
          "--csv-path",
          playerCsvPath(playerName, p),
          "--player",
          playerName,
          "--stable-name",
          "--from",
          from,
          "--to",
          to,
        ], {
          timeoutMs: 120000,
        }).trim();

        result.csv_path = csvOutput;
        result.csv_status = "ok";
        appendExportProgress(reportPath, "player_csv_done", {
          player: playerName,
          wr_id: p.wr_id,
          csv_path: csvOutput,
        });
      }
    } catch (err) {
      result.error = err instanceof Error ? err.message : String(err);
      if (result.fetch_status === "skipped") result.fetch_status = "failed";
      if (result.csv_status === "skipped") result.csv_status = "failed";
      appendExportProgress(reportPath, "player_fail", {
        player: playerName,
        wr_id: p.wr_id,
        fetch_status: result.fetch_status,
        csv_status: result.csv_status,
        error: result.error,
      });
    }

    summary.results.push(result);
    const icon = result.error ? "FAIL" : "OK";
    console.log(`[${icon}] ${playerName} fetch=${result.fetch_status} csv=${result.csv_status}`);
    appendExportProgress(reportPath, "player_done", {
      player: playerName,
      wr_id: p.wr_id,
      fetch_status: result.fetch_status,
      csv_status: result.csv_status,
      error: result.error,
    });
  }

  writeJson(reportPath, summary);
  appendExportProgress(reportPath, "team_export_done", {
    team_name: teamName,
    total_results: summary.results.length,
  });
  console.log(`report: ${reportPath}`);
}

main();
