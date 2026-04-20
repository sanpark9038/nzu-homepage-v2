const fs = require("fs");
const path = require("path");

function argValue(argv, flag, fallback = null) {
  const idx = argv.indexOf(flag);
  if (idx >= 0 && argv[idx + 1]) return argv[idx + 1];
  return fallback;
}

function safeFileName(name) {
  const sanitized = String(name || "").replace(/[<>:"/\\|?*\x00-\x1F]/g, "_").trim();
  const nonPlaceholder = sanitized.replace(/[_\s.-]/g, "");
  return nonPlaceholder ? sanitized : "unknown_player";
}

function buildOutputPaths({ univ, player, from, to, stableName, explicitReportPath, explicitCsvPath }) {
  const safePlayer = safeFileName(player);
  const reportPath =
    explicitReportPath || path.join(process.cwd(), "tmp", `${univ}_${safePlayer}_matches.json`);
  const csvFileName = stableName
    ? `${safePlayer}_matches.csv`
    : `${safePlayer}_matches_${from}_${to}.csv`;
  const csvPath = explicitCsvPath || path.join(process.cwd(), "tmp", csvFileName);
  return { reportPath, csvPath };
}

function splitOpponent(text) {
  const raw = String(text || "").trim();
  const m = raw.match(/^(.*)\(([^)]+)\)$/);
  if (!m) return { name: raw, race: "" };
  return { name: m[1].trim(), race: m[2].trim() };
}

function csvEscape(v) {
  const s = String(v ?? "");
  if (/[",\r\n]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
  return s;
}

function sleepMs(ms) {
  Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, ms);
}

function writeFileWithRetry(filePath, content, encoding = "utf8") {
  const maxAttempts = 5;
  let lastErr = null;
  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    try {
      fs.writeFileSync(filePath, content, encoding);
      return;
    } catch (err) {
      const code = String(err && err.code ? err.code : "");
      const retriable = code === "EBUSY" || code === "EPERM" || code === "EACCES";
      lastErr = err;
      if (!retriable || attempt >= maxAttempts) break;
      sleepMs(150 * attempt);
    }
  }
  throw lastErr;
}

function safeFallbackCsvPath(filePath) {
  const ext = path.extname(filePath) || ".csv";
  const base = filePath.slice(0, -ext.length);
  const stamp = new Date().toISOString().replace(/[:.]/g, "-");
  return `${base}_retry_${stamp}${ext}`;
}

function pruneOldRetryFiles(primaryPath, keepCount = 1) {
  const ext = path.extname(primaryPath) || ".csv";
  const base = primaryPath.slice(0, -ext.length);
  const dir = path.dirname(primaryPath);
  const fileBase = path.basename(base);
  const rx = new RegExp(`^${fileBase.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}_retry_.*\\${ext.replace(".", "\\.")}$`);
  let files = [];
  try {
    files = fs
      .readdirSync(dir)
      .filter((name) => rx.test(name))
      .map((name) => {
        const p = path.join(dir, name);
        const st = fs.statSync(p);
        return { path: p, mtime: st.mtimeMs };
      })
      .sort((a, b) => b.mtime - a.mtime);
  } catch {
    return;
  }
  for (let i = keepCount; i < files.length; i += 1) {
    try {
      fs.unlinkSync(files[i].path);
    } catch {
      // Keep silent if file is locked; next run can clean it.
    }
  }
}

function writeCsvWithFallback(filePath, content) {
  try {
    writeFileWithRetry(filePath, content, "utf8");
    pruneOldRetryFiles(filePath, 0);
    return filePath;
  } catch (err) {
    const code = String(err && err.code ? err.code : "");
    if (code !== "EBUSY" && code !== "EPERM" && code !== "EACCES") throw err;
    const altPath = safeFallbackCsvPath(filePath);
    writeFileWithRetry(altPath, content, "utf8");
    pruneOldRetryFiles(filePath, 1);
    return altPath;
  }
}

function main(rawArgv = process.argv.slice(2)) {
  const univ = argValue(rawArgv, "--univ", "team");
  const player = argValue(rawArgv, "--player", null);
  if (!player) {
    console.error("Missing required arg: --player <name>");
    process.exit(1);
  }

  const from = argValue(rawArgv, "--from", "2025-01-01");
  const to = argValue(rawArgv, "--to", new Date().toISOString().slice(0, 10));
  const stableName = rawArgv.includes("--stable-name");
  const explicitReportPath = argValue(rawArgv, "--report-path", null);
  const explicitCsvPath = argValue(rawArgv, "--csv-path", null);
  const { reportPath, csvPath } = buildOutputPaths({
    univ,
    player,
    from,
    to,
    stableName,
    explicitReportPath,
    explicitCsvPath,
  });

  if (!fs.existsSync(reportPath)) {
    console.error(`Missing source JSON: ${reportPath}`);
    process.exit(1);
  }
  const raw = fs.readFileSync(reportPath, "utf8").replace(/^\uFEFF/, "");
  const json = JSON.parse(raw);
  const p = (json.players || [])[0];
  const header = ["date", "opponent_name", "opponent_race", "map", "result", "note"];
  const lines = [header.join(",")];
  if (!p || !Array.isArray(p.matches)) {
    const bom = "\uFEFF";
    const finalPath = writeCsvWithFallback(csvPath, bom + lines.join("\n"));
    console.log(finalPath);
    return;
  }

  const rows = p.matches.slice();

  for (const r of rows) {
    const opp = splitOpponent(r.opponent);
    const values = [
      r.date,
      opp.name,
      opp.race,
      r.map || "",
      r.is_win ? "win" : "loss",
      r.note || "",
    ].map(csvEscape);
    lines.push(values.join(","));
  }

  const bom = "\uFEFF";
  const finalPath = writeCsvWithFallback(csvPath, bom + lines.join("\n"));
  console.log(finalPath);
}

if (require.main === module) {
  main();
}

module.exports = {
  safeFileName,
  buildOutputPaths,
  writeCsvWithFallback,
};
