const fs = require("fs");
const path = require("path");

const ROOT = process.cwd();

function argValue(name, fallback = "") {
  const idx = process.argv.indexOf(name);
  if (idx >= 0 && process.argv[idx + 1]) return String(process.argv[idx + 1]);
  return fallback;
}

function hasFlag(name) {
  return process.argv.includes(name);
}

function readJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, "utf8").replace(/^\uFEFF/, ""));
}

function makeTeamSlug(name) {
  const slug = String(name || "")
    .replace(/[^\w\uAC00-\uD7A3]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .toLowerCase();
  if (slug) return slug;
  return encodeURIComponent(String(name || "")).toLowerCase();
}

function loadDefaultTeamCodes() {
  const projectsDir = path.join(ROOT, "data", "metadata", "projects");
  if (!fs.existsSync(projectsDir)) return [];
  return fs
    .readdirSync(projectsDir, { withFileTypes: true })
    .filter((d) => d.isDirectory())
    .map((d) => d.name)
    .filter((code) => code !== "fa")
    .filter((code) => fs.existsSync(path.join(projectsDir, code, `players.${code}.v1.json`)))
    .sort((a, b) => String(a).localeCompare(String(b)));
}

function resolvePaths(teamCodeArg, rosterPathArg, recordPathArg) {
  const teamCode = (teamCodeArg || "").trim().toLowerCase();
  const rosterPath = rosterPathArg
    ? path.resolve(ROOT, rosterPathArg)
    : path.join(ROOT, "data", "metadata", "projects", teamCode, `players.${teamCode}.v1.json`);
  if (!fs.existsSync(rosterPath)) {
    throw new Error(`Missing roster metadata file: ${rosterPath}`);
  }

  const rosterJson = readJson(rosterPath);
  const teamName = String(rosterJson.team_name || "");
  if (!teamName) {
    throw new Error(`team_name is missing in roster metadata: ${rosterPath}`);
  }
  const fetchName = String(rosterJson.fetch_univ_name || "").trim();
  const aliases = Array.isArray(rosterJson.team_aliases) ? rosterJson.team_aliases.map((v) => String(v || "").trim()) : [];
  const nameCandidates = [...new Set([teamName, fetchName, ...aliases].filter(Boolean))];

  const candidates = recordPathArg
    ? [path.resolve(ROOT, recordPathArg)]
    : [
        ...nameCandidates.map((n) => path.join(ROOT, "tmp", `${makeTeamSlug(n)}_roster_record_metadata.json`)),
        path.join(ROOT, "tmp", `${teamCode}_roster_record_metadata.json`),
      ];
  const recordPath = candidates.find((p) => fs.existsSync(p)) || candidates[0];
  if (!fs.existsSync(recordPath)) {
    throw new Error(
      `Missing roster record metadata file. Tried:\n- ${candidates.join("\n- ")}\n` +
        `Run: node scripts/tools/export-team-roster-metadata.js --univ ${teamName}`
    );
  }

  return { rosterPath, recordPath, teamCode, teamName };
}

function asNum(v) {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
}

function tierRank(tier) {
  const raw = String(tier || "").trim().toLowerCase();
  const map = {
    god: "god",
    갓: "god",
    king: "king",
    킹: "king",
    킹티어: "king",
    jack: "jack",
    잭: "jack",
    잭티어: "jack",
    joker: "joker",
    조커: "joker",
    spade: "spade",
    스페이드: "spade",
    baby: "9",
    베이비: "9",
    유스: "9",
  };
  const key = map[raw] || (/^\d+$/.test(raw) ? raw : raw || "unknown");
  const order = ["god", "king", "jack", "joker", "spade", "0", "1", "2", "3"];
  const idx = order.indexOf(key);
  if (idx >= 0) return idx;
  if (/^\d+$/.test(key)) return 100 + Number(key);
  return 999;
}

function pct(w, t) {
  if (!t) return 0;
  return Number(((w / t) * 100).toFixed(2));
}

function toMarkdown(rows) {
  const lines = [];
  lines.push("| 이름 | 티어 | 종족 | 전적 | 승 | 패 | 승률(%) |");
  lines.push("|---|---:|---|---:|---:|---:|---:|");
  for (const row of rows) {
    lines.push(
      `| ${row.display_name || row.name} | ${row.tier} | ${row.race} | ${row.total} | ${row.wins} | ${row.losses} | ${row.winRate.toFixed(
        2
      )} |`
    );
  }
  return `${lines.join("\n")}\n`;
}

function buildTeamTable(teamCode, rosterPathArg = "", recordPathArg = "") {
  const { rosterPath, recordPath, teamName } = resolvePaths(teamCode, rosterPathArg, recordPathArg);
  const rosterJson = readJson(rosterPath);
  const recordJson = readJson(recordPath);
  const byWrId = new Map((recordJson.players || []).map((p) => [String(p.wr_id), p]));

  const rows = (rosterJson.roster || []).map((r) => {
    const record = byWrId.get(String(r.wr_id));
    const total = asNum(record && record.record && record.record.total);
    const wins = asNum(record && record.record && record.record.wins);
    const losses = asNum(record && record.record && record.record.losses);
    return {
      name: String(r.name || ""),
      display_name: String(r.display_name || ""),
      role_title: String(r.role_title || ""),
      role_priority:
        r.role_priority === null || r.role_priority === undefined || r.role_priority === ""
          ? 9999
          : asNum(r.role_priority),
      tier: String(r.tier || "-"),
      race: String(r.race || "-"),
      total,
      wins,
      losses,
      winRate: pct(wins, total),
    };
  })
  .sort((a, b) => {
    const ap = asNum(a.role_priority);
    const bp = asNum(b.role_priority);
    if (ap !== bp) return ap - bp;
    const at = tierRank(a.tier);
    const bt = tierRank(b.tier);
    if (at !== bt) return at - bt;
    return String(a.display_name || a.name).localeCompare(String(b.display_name || b.name), "ko");
  });

  return {
    team_code: rosterJson.team_code || teamCode,
    team_name: rosterJson.team_name || teamName,
    source: {
      roster_path: path.relative(ROOT, rosterPath),
      record_path: path.relative(ROOT, recordPath),
      record_generated_at: recordJson.generated_at || null,
      period: recordJson.period || null,
    },
    rows,
  };
}

function writeOutput(outPath, content) {
  fs.mkdirSync(path.dirname(outPath), { recursive: true });
  fs.writeFileSync(outPath, content, "utf8");
}

function buildJsonPayload(table) {
  return {
    generated_at: new Date().toISOString(),
    team_code: table.team_code,
    team_name: table.team_name,
    source: table.source,
    rows: table.rows,
  };
}

function parseTeamCodes() {
  const single = argValue("--team-code", argValue("--project", "")).trim().toLowerCase();
  const teamsArg = argValue("--teams", "")
    .split(",")
    .map((v) => v.trim().toLowerCase())
    .filter(Boolean);
  if (hasFlag("--all")) return loadDefaultTeamCodes();
  if (teamsArg.length) return [...new Set(teamsArg)];
  if (single) return [single];
  return [];
}

function runBatch(teamCodes) {
  const outDir = path.resolve(ROOT, argValue("--out-dir", "tmp/reports/team-roster-table"));
  const summary = [];

  for (const teamCode of teamCodes) {
    const table = buildTeamTable(teamCode);
    const md = toMarkdown(table.rows);
    const json = `${JSON.stringify(buildJsonPayload(table), null, 2)}\n`;
    const mdPath = path.join(outDir, `${teamCode}.table.md`);
    const jsonPath = path.join(outDir, `${teamCode}.table.json`);
    writeOutput(mdPath, md);
    writeOutput(jsonPath, json);
    summary.push({
      team_code: table.team_code,
      team_name: table.team_name,
      players: table.rows.length,
      md: path.relative(ROOT, mdPath),
      json: path.relative(ROOT, jsonPath),
    });
  }

  process.stdout.write(`${JSON.stringify({ out_dir: path.relative(ROOT, outDir), teams: summary }, null, 2)}\n`);
}

function main() {
  const teamCodes = parseTeamCodes();
  const rosterPathArg = argValue("--roster-path", "");
  const recordPathArg = argValue("--record-path", "");
  const outPathArg = argValue("--out", "");
  const format = argValue("--format", "md").toLowerCase();

  if (!teamCodes.length && !rosterPathArg) {
    throw new Error(
      "Usage: node scripts/tools/report-team-roster-table.js --team-code <code> [--format md|json] [--out <path>] or --teams <a,b,c> or --all [--out-dir <dir>]"
    );
  }

  if (teamCodes.length > 1 || hasFlag("--all") || argValue("--teams", "")) {
    runBatch(teamCodes);
    return;
  }

  const table = buildTeamTable(teamCodes[0], rosterPathArg, recordPathArg);

  let output = "";
  if (format === "json") {
    output = `${JSON.stringify(buildJsonPayload(table), null, 2)}\n`;
  } else if (format === "md") {
    output = toMarkdown(table.rows);
  } else {
    throw new Error(`Unsupported format: ${format}. Use md or json.`);
  }

  if (outPathArg) {
    const outPath = path.resolve(ROOT, outPathArg);
    fs.mkdirSync(path.dirname(outPath), { recursive: true });
    fs.writeFileSync(outPath, output, "utf8");
    console.log(outPath);
    return;
  }

  process.stdout.write(output);
}

main();
