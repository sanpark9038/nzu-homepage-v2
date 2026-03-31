const fs = require("fs");
const path = require("path");
const { spawnSync } = require("child_process");

const ROOT = path.resolve(__dirname, "..", "..");
const PROJECTS_DIR = path.join(ROOT, "data", "metadata", "projects");
const REPORT_DIR = path.join(ROOT, "tmp", "reports");
const NODE_BIN = process.execPath || "node";
const NODE_BIN_FALLBACK = "node";
const MERGE_SCRIPT = "scripts/tools/merge-chunked-daily-reports.js";
const ROSTER_SYNC_SCRIPT = "scripts/tools/sync-team-roster-metadata.js";
const DISPLAY_ALIAS_SCRIPT = "scripts/tools/apply-player-display-aliases.js";
const PRIORITY_SCRIPT = "scripts/tools/update-player-check-priority.js";

function argValue(flag, fallback = null) {
  const idx = process.argv.indexOf(flag);
  if (idx >= 0 && process.argv[idx + 1]) return process.argv[idx + 1];
  return fallback;
}

function hasFlag(flag) {
  return process.argv.includes(flag);
}

function timestamp() {
  const d = new Date();
  const p = (n) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}_${p(d.getHours())}${p(d.getMinutes())}${p(d.getSeconds())}`;
}

function todayDateTag() {
  return new Intl.DateTimeFormat("sv-SE", {
    timeZone: "Asia/Seoul",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());
}

function ensureDir(dirPath) {
  fs.mkdirSync(dirPath, { recursive: true });
}

function loadTeamCodes() {
  if (!fs.existsSync(PROJECTS_DIR)) return [];
  const dirs = fs
    .readdirSync(PROJECTS_DIR, { withFileTypes: true })
    .filter((d) => d.isDirectory())
    .map((d) => d.name)
    .sort((a, b) => String(a).localeCompare(String(b)));
  return dirs.filter((code) => {
    const filePath = path.join(PROJECTS_DIR, code, `players.${code}.v1.json`);
    if (!fs.existsSync(filePath)) return false;
    try {
      const json = JSON.parse(fs.readFileSync(filePath, "utf8").replace(/^\uFEFF/, ""));
      return !json.manual_managed;
    } catch {
      return false;
    }
  });
}

function splitIntoChunks(arr, chunkSize) {
  const out = [];
  for (let i = 0; i < arr.length; i += chunkSize) {
    out.push(arr.slice(i, i + chunkSize));
  }
  return out;
}

function formatSecs(sec) {
  const s = Math.max(0, Math.round(sec));
  const m = Math.floor(s / 60);
  const r = s % 60;
  return `${m}m ${r}s`;
}

function runNode(args) {
  let used = NODE_BIN;
  let res = spawnSync(used, args, {
    cwd: ROOT,
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
    maxBuffer: 64 * 1024 * 1024,
  });
  if (res.error && String(res.error.code || "") === "EPERM" && NODE_BIN !== NODE_BIN_FALLBACK) {
    used = NODE_BIN_FALLBACK;
    res = spawnSync(used, args, {
      cwd: ROOT,
      encoding: "utf8",
      stdio: ["ignore", "pipe", "pipe"],
      maxBuffer: 64 * 1024 * 1024,
    });
  }
  return {
    node_bin: used,
    status: res.status,
    ok: res.status === 0,
    stdout: String(res.stdout || "").trim(),
    stderr: String(res.stderr || "").trim(),
    error: res.error ? String(res.error.message || res.error) : "",
  };
}

function tail(text, count = 10) {
  return String(text || "")
    .split(/\r?\n/)
    .map((v) => v.trimEnd())
    .filter(Boolean)
    .slice(-count);
}

function runCommonPreparation(teamCodes, allTeamCodes) {
  const steps = [];
  const isFullSync = teamCodes.length === allTeamCodes.length && teamCodes.every((code, idx) => code === allTeamCodes[idx]);
  const rosterArgs = isFullSync
    ? [ROSTER_SYNC_SCRIPT]
    : [ROSTER_SYNC_SCRIPT, "--teams", teamCodes.join(","), "--allow-partial"];
  const rosterRes = runNode(rosterArgs);
  steps.push({
    name: "roster_sync",
    ok: rosterRes.ok,
    command: `${rosterRes.node_bin} ${rosterArgs.join(" ")}`,
    stdout_tail: tail(rosterRes.stdout),
    stderr_tail: tail([rosterRes.stderr, rosterRes.error].filter(Boolean).join("\n")),
  });
  if (!rosterRes.ok) return { ok: false, steps };

  for (const teamCode of teamCodes.filter((code) => code !== "fa")) {
    const aliasArgs = [DISPLAY_ALIAS_SCRIPT, "--project", teamCode];
    const aliasRes = runNode(aliasArgs);
    steps.push({
      name: `display_alias:${teamCode}`,
      ok: aliasRes.ok,
      command: `${aliasRes.node_bin} ${aliasArgs.join(" ")}`,
      stdout_tail: tail(aliasRes.stdout),
      stderr_tail: tail([aliasRes.stderr, aliasRes.error].filter(Boolean).join("\n")),
    });
    if (!aliasRes.ok) return { ok: false, steps };
  }

  return { ok: true, steps };
}

function main() {
  ensureDir(REPORT_DIR);
  const chunkSize = Math.max(1, Number(argValue("--chunk-size", "3")) || 3);
  const continueOnError = hasFlag("--continue-on-error");
  const dateTag = timestamp();
  const baseDateTag = todayDateTag();
  const runTag = dateTag;

  const teamArg = String(argValue("--teams", "")).trim().toLowerCase();
  const requested = new Set(teamArg.split(",").map((v) => v.trim()).filter(Boolean));
  const all = loadTeamCodes();
  const teams = requested.size ? all.filter((c) => requested.has(c)) : all;
  if (!teams.length) {
    throw new Error(`No teams selected. Available: ${all.join(",") || "<none>"}`);
  }

  const chunks = splitIntoChunks(teams, chunkSize);
  const passThroughFlags = [];
  const from = argValue("--from", null);
  const to = argValue("--to", null);
  const concurrency = argValue("--concurrency", null);
  const inactiveSkipDays = argValue("--inactive-skip-days", null);
  if (from) passThroughFlags.push("--from", from);
  if (to) passThroughFlags.push("--to", to);
  if (concurrency) passThroughFlags.push("--concurrency", concurrency);
  if (inactiveSkipDays) passThroughFlags.push("--inactive-skip-days", inactiveSkipDays);
  if (hasFlag("--no-use-existing-json")) passThroughFlags.push("--no-use-existing-json");

  const startedAt = Date.now();
  const chunkReports = [];
  const chunkDateTags = [];
  let hadFailure = false;
  const preparation = runCommonPreparation(teams, all);
  if (!preparation.ok) hadFailure = true;

  console.log(`[START] chunked ops: teams=${teams.length}, chunk_size=${chunkSize}, chunks=${chunks.length}`);
  if (!preparation.ok) {
    console.log("[PREP] FAIL common preparation");
  }
  for (let i = 0; i < chunks.length && !hadFailure; i += 1) {
    const chunkTeams = chunks[i];
    const idx = i + 1;
    const chunkStarted = Date.now();
    const args = [
      "scripts/tools/run-ops-pipeline.js",
      "--skip-supabase",
      "--no-discord",
      "--teams",
      chunkTeams.join(","),
      "--date-tag",
      `${runTag}-chunk${idx}`,
      "--no-roster-sync",
      "--no-display-alias",
      "--no-team-table",
      "--no-organize",
      ...passThroughFlags,
    ];
    chunkDateTags.push(`${runTag}-chunk${idx}`);
    console.log(`[CHUNK ${idx}/${chunks.length}] teams=${chunkTeams.join(",")}`);
    const res = runNode(args);
    const elapsed = (Date.now() - chunkStarted) / 1000;
    const spent = (Date.now() - startedAt) / 1000;
    const avg = spent / idx;
    const eta = avg * (chunks.length - idx);
    const statusText = res.ok ? "PASS" : "FAIL";
    console.log(`[CHUNK ${idx}/${chunks.length}] ${statusText} elapsed=${formatSecs(elapsed)} eta=${formatSecs(eta)}`);

    chunkReports.push({
      chunk_index: idx,
      chunk_total: chunks.length,
      date_tag: `${runTag}-chunk${idx}`,
      teams: chunkTeams,
      ok: res.ok,
      exit_code: res.status,
      elapsed_seconds: elapsed,
      node_bin: res.node_bin,
      stdout_tail: tail(res.stdout),
      stderr_tail: tail([res.stderr, res.error].filter(Boolean).join("\n")),
    });

    if (!res.ok) {
      hadFailure = true;
      if (!continueOnError) break;
    }
  }

  const endedAt = Date.now();
  let merged = {
    ok: false,
    skipped: hadFailure,
    reason: hadFailure ? "skipped_due_to_failed_chunk" : "",
  };
  if (!hadFailure) {
    const mergeArgs = [
      MERGE_SCRIPT,
      "--output-date",
      baseDateTag,
      "--chunk-date-tags",
      chunkDateTags.join(","),
    ];
    const mergeRes = runNode(mergeArgs);
    merged = {
      ok: mergeRes.ok,
      skipped: false,
      command: `${mergeRes.node_bin} ${mergeArgs.join(" ")}`,
      stdout_tail: tail(mergeRes.stdout),
      stderr_tail: tail([mergeRes.stderr, mergeRes.error].filter(Boolean).join("\n")),
    };
    if (!mergeRes.ok) hadFailure = true;
  }

  let priorityUpdate = {
    ok: false,
    skipped: hadFailure,
    reason: hadFailure ? "skipped_due_to_failed_pipeline" : "",
  };
  if (!hadFailure) {
    const priorityArgs = [PRIORITY_SCRIPT, "--teams", teams.join(",")];
    const priorityRes = runNode(priorityArgs);
    priorityUpdate = {
      ok: priorityRes.ok,
      skipped: false,
      command: `${priorityRes.node_bin} ${priorityArgs.join(" ")}`,
      stdout_tail: tail(priorityRes.stdout),
      stderr_tail: tail([priorityRes.stderr, priorityRes.error].filter(Boolean).join("\n")),
    };
    if (!priorityRes.ok) hadFailure = true;
  }

  const summary = {
    generated_at: new Date().toISOString(),
    status: hadFailure ? "fail" : "pass",
    chunk_size: chunkSize,
    total_teams: teams.length,
    total_chunks: chunks.length,
    continue_on_error: continueOnError,
    elapsed_seconds: (endedAt - startedAt) / 1000,
    teams,
    run_tag: runTag,
    preparation,
    merged_daily_snapshot: merged,
    priority_update: priorityUpdate,
    chunks: chunkReports,
  };

  const outPath = path.join(REPORT_DIR, `ops_pipeline_chunked_${dateTag}.json`);
  const latestPath = path.join(REPORT_DIR, "ops_pipeline_chunked_latest.json");
  fs.writeFileSync(outPath, JSON.stringify(summary, null, 2), "utf8");
  fs.writeFileSync(latestPath, JSON.stringify(summary, null, 2), "utf8");

  console.log(`[DONE] ${path.relative(ROOT, outPath).replace(/\\/g, "/")}`);
  console.log(`[DONE] ${path.relative(ROOT, latestPath).replace(/\\/g, "/")}`);

  if (hadFailure) process.exit(1);
}

main();
