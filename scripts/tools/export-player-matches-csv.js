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

const reportPath = path.join(process.cwd(), "tmp", `${univ}_${player}_matches.json`);
const csvPath = path.join(process.cwd(), "tmp", `${player}_상세전적_${from}_${to}.csv`);

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

function main() {
  if (!fs.existsSync(reportPath)) {
    console.error(`Missing source JSON: ${reportPath}`);
    process.exit(1);
  }
  const raw = fs.readFileSync(reportPath, "utf8").replace(/^\uFEFF/, "");
  const json = JSON.parse(raw);
  const p = (json.players || [])[0];
  if (!p || !Array.isArray(p.matches)) {
    console.error("No matches found in source JSON.");
    process.exit(1);
  }

  const rows = p.matches.slice().sort((a, b) => {
    if (a.date !== b.date) return a.date < b.date ? 1 : -1;
    const ao = String(a.opponent || "");
    const bo = String(b.opponent || "");
    if (ao !== bo) return ao > bo ? 1 : -1;
    return 0;
  });

  const header = ["날짜", "상대명", "상대종족", "맵", "경기결과(승/패)", "메모"];
  const lines = [header.join(",")];

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
  fs.writeFileSync(csvPath, bom + lines.join("\n"), "utf8");
  console.log(csvPath);
}

main();
