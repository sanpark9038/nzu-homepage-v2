const fs = require("fs");
const path = require("path");
const argv = process.argv.slice(2);

function argValue(flag, fallback = null) {
  const idx = argv.indexOf(flag);
  if (idx >= 0 && argv[idx + 1]) return argv[idx + 1];
  return fallback;
}

const univ = argValue("--univ", "늪지대");
const player = argValue("--player", null);
if (!player) {
  console.error("Missing required arg: --player <name>");
  process.exit(1);
}

const from = argValue("--from", "2025-01-01");
const to = argValue("--to", new Date().toISOString().slice(0, 10));
const stableName = process.argv.includes("--stable-name");
const explicitReportPath = argValue("--report-path", null);
const explicitCsvPath = argValue("--csv-path", null);

const reportPath = explicitReportPath || path.join(process.cwd(), "tmp", `${univ}_${player}_matches.json`);
const csvFileName = stableName
  ? `${player}_상세전적.csv`
  : `${player}_상세전적_${from}_${to}.csv`;
const csvPath = explicitCsvPath || path.join(process.cwd(), "tmp", csvFileName);

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

function main() {
  if (!fs.existsSync(reportPath)) {
    console.error(`Missing source JSON: ${reportPath}`);
    process.exit(1);
  }
  const raw = fs.readFileSync(reportPath, "utf8").replace(/^\uFEFF/, "");
  const json = JSON.parse(raw);
  const p = (json.players || [])[0];
  const header = ["날짜", "상대명", "상대종족", "맵", "경기결과(승/패)", "메모"];
  const lines = [header.join(",")];
  if (!p || !Array.isArray(p.matches)) {
    // Keep pipeline stable: write an empty CSV (header only) for 0-match players.
    const bom = "\uFEFF";
    const finalPath = writeCsvWithFallback(csvPath, bom + lines.join("\n"));
    console.log(finalPath);
    return;
  }

  const rows = p.matches.slice().sort((a, b) => {
    if (a.date !== b.date) return a.date < b.date ? 1 : -1;
    const ao = String(a.opponent || "");
    const bo = String(b.opponent || "");
    if (ao !== bo) return ao > bo ? 1 : -1;
    return 0;
  });

  for (const r of rows) {
    const opp = splitOpponent(r.opponent);
    const values = [
      r.date,
      opp.name,
      opp.race,
      r.map || "",
      r.is_win ? "승" : "패",
      r.note || "",
    ].map(csvEscape);
    lines.push(values.join(","));
  }

  // UTF-8 BOM for Excel compatibility on Windows
  const bom = "\uFEFF";
  const finalPath = writeCsvWithFallback(csvPath, bom + lines.join("\n"));
  console.log(finalPath);
}

main();
