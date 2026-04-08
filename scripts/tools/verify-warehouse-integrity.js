const fs = require("fs");
const path = require("path");

const ROOT = path.resolve(__dirname, "..", "..");
const WAREHOUSE_DIR = path.join(ROOT, "data", "warehouse");
const TMP_DIR = path.join(ROOT, "tmp");

const FACT_PATH = path.join(WAREHOUSE_DIR, "fact_matches.csv");
const AGG_PLAYER_PATH = path.join(WAREHOUSE_DIR, "agg_daily_player.csv");
const AGG_TEAM_PATH = path.join(WAREHOUSE_DIR, "agg_daily_team.csv");
const REPORT_PATH = path.join(TMP_DIR, "warehouse_integrity_report.json");

function argValue(flag, fallback = null) {
  const idx = process.argv.indexOf(flag);
  if (idx >= 0 && process.argv[idx + 1]) return process.argv[idx + 1];
  return fallback;
}

function parseCsvLine(line) {
  const out = [];
  let cur = "";
  let inQuotes = false;
  for (let i = 0; i < line.length; i += 1) {
    const ch = line[i];
    if (inQuotes) {
      if (ch === '"') {
        if (line[i + 1] === '"') {
          cur += '"';
          i += 1;
        } else {
          inQuotes = false;
        }
      } else {
        cur += ch;
      }
    } else if (ch === ",") {
      out.push(cur);
      cur = "";
    } else if (ch === '"') {
      inQuotes = true;
    } else {
      cur += ch;
    }
  }
  out.push(cur);
  return out;
}

function splitCsvRecords(raw) {
  const records = [];
  let cur = "";
  let inQuotes = false;
  for (let i = 0; i < raw.length; i += 1) {
    const ch = raw[i];
    if (ch === '"') {
      cur += ch;
      if (inQuotes && raw[i + 1] === '"') {
        cur += raw[i + 1];
        i += 1;
      } else {
        inQuotes = !inQuotes;
      }
      continue;
    }
    if (!inQuotes && (ch === "\n" || ch === "\r")) {
      if (cur.length > 0) records.push(cur);
      cur = "";
      if (ch === "\r" && raw[i + 1] === "\n") i += 1;
      continue;
    }
    cur += ch;
  }
  if (cur.length > 0) records.push(cur);
  return records.filter((record) => record.length > 0);
}

function readCsv(filePath) {
  if (!fs.existsSync(filePath)) return [];
  const raw = fs.readFileSync(filePath, "utf8").replace(/^\uFEFF/, "");
  const records = splitCsvRecords(raw);
  if (!records.length) return [];
  const headers = parseCsvLine(records[0]);
  return records.slice(1).map((line) => {
    const cols = parseCsvLine(line);
    const row = {};
    headers.forEach((h, idx) => {
      row[h] = cols[idx] ?? "";
    });
    return row;
  });
}

function toInt(v) {
  const n = Number(v);
  return Number.isFinite(n) ? Math.trunc(n) : 0;
}

function isIsoDate(v) {
  return /^\d{4}-\d{2}-\d{2}$/.test(String(v || ""));
}

function keyDatePlayer(row) {
  return `${row.match_date}|${row.player_entity_id}`;
}

function keyDateTeam(row) {
  return `${row.match_date}|${row.team}`;
}

function parseTeamFilter() {
  const raw = String(argValue("--teams", "") || "")
    .split(",")
    .map((v) => v.trim().toLowerCase())
    .filter(Boolean);
  return raw.length ? new Set(raw) : null;
}

function buildAggFromFacts(facts) {
  const byPlayer = new Map();
  for (const r of facts) {
    const key = `${r.match_date}|${r.player_entity_id}|${r.player_name}|${r.team}|${r.tier}|${r.race}`;
    if (!byPlayer.has(key)) {
      byPlayer.set(key, {
        match_date: r.match_date,
        player_entity_id: r.player_entity_id,
        player_name: r.player_name,
        team: r.team,
        tier: r.tier,
        race: r.race,
        matches: 0,
        wins: 0,
        losses: 0,
      });
    }
    const g = byPlayer.get(key);
    g.matches += 1;
    if (String(r.is_win).toLowerCase() === "true" || String(r.result) === "승") g.wins += 1;
    else g.losses += 1;
  }

  const playerRows = [...byPlayer.values()].map((r) => ({
    ...r,
    win_rate: r.matches ? ((r.wins / r.matches) * 100).toFixed(2) : "0.00",
  }));

  const byTeam = new Map();
  for (const r of playerRows) {
    const key = `${r.match_date}|${r.team}`;
    if (!byTeam.has(key)) {
      byTeam.set(key, {
        match_date: r.match_date,
        team: r.team,
        matches: 0,
        wins: 0,
        losses: 0,
        players: new Set(),
      });
    }
    const g = byTeam.get(key);
    g.matches += r.matches;
    g.wins += r.wins;
    g.losses += r.losses;
    g.players.add(r.player_entity_id);
  }

  const teamRows = [...byTeam.values()].map((r) => ({
    match_date: r.match_date,
    team: r.team,
    matches: r.matches,
    wins: r.wins,
    losses: r.losses,
    unique_players: r.players.size,
    win_rate: r.matches ? ((r.wins / r.matches) * 100).toFixed(2) : "0.00",
  }));

  return { playerRows, teamRows };
}

function main() {
  const teamFilter = parseTeamFilter();
  const facts = readCsv(FACT_PATH).filter((row) => {
    if (!teamFilter) return true;
    return teamFilter.has(String(row.team || "").trim().toLowerCase());
  });
  const aggPlayer = readCsv(AGG_PLAYER_PATH);
  const aggTeam = readCsv(AGG_TEAM_PATH);

  const errors = [];
  const warnings = [];

  if (!facts.length) warnings.push("fact_matches.csv is empty.");
  if (!aggPlayer.length) warnings.push("agg_daily_player.csv is empty.");
  if (!aggTeam.length) warnings.push("agg_daily_team.csv is empty.");

  const matchKeyDup = new Set();
  const seenMatchKey = new Set();
  for (const r of facts) {
    if (!r.match_key) errors.push(`fact row missing match_key (${r.player_name}, ${r.match_date})`);
    if (seenMatchKey.has(r.match_key)) matchKeyDup.add(r.match_key);
    seenMatchKey.add(r.match_key);
    if (!isIsoDate(r.match_date)) errors.push(`invalid fact match_date: ${r.match_date}`);
    if (!r.player_entity_id) errors.push(`missing player_entity_id in fact: ${r.player_name}`);
  }
  if (matchKeyDup.size) errors.push(`duplicate match_key count: ${matchKeyDup.size}`);

  const expected = buildAggFromFacts(facts);

  const expectedPlayerMap = new Map(expected.playerRows.map((r) => [keyDatePlayer(r), r]));
  const aggPlayerRowsScoped = teamFilter
    ? aggPlayer.filter((r) => expectedPlayerMap.has(keyDatePlayer(r)))
    : aggPlayer;
  const aggPlayerMap = new Map(aggPlayerRowsScoped.map((r) => [keyDatePlayer(r), r]));

  for (const [k, exp] of expectedPlayerMap.entries()) {
    const cur = aggPlayerMap.get(k);
    if (!cur) {
      errors.push(`agg_daily_player missing key: ${k}`);
      continue;
    }
    if (
      toInt(cur.matches) !== exp.matches ||
      toInt(cur.wins) !== exp.wins ||
      toInt(cur.losses) !== exp.losses
    ) {
      errors.push(
        `agg_daily_player mismatch ${k}: cur(${cur.matches}/${cur.wins}/${cur.losses}) != exp(${exp.matches}/${exp.wins}/${exp.losses})`
      );
    }
  }
  if (!teamFilter) {
    for (const k of aggPlayerMap.keys()) {
      if (!expectedPlayerMap.has(k)) warnings.push(`agg_daily_player extra key: ${k}`);
    }
  }

  const expectedTeamMap = new Map(expected.teamRows.map((r) => [keyDateTeam(r), r]));
  const aggTeamRowsScoped = teamFilter
    ? aggTeam.filter((r) => expectedTeamMap.has(keyDateTeam(r)))
    : aggTeam;
  const aggTeamMap = new Map(aggTeamRowsScoped.map((r) => [keyDateTeam(r), r]));

  for (const [k, exp] of expectedTeamMap.entries()) {
    const cur = aggTeamMap.get(k);
    if (!cur) {
      errors.push(`agg_daily_team missing key: ${k}`);
      continue;
    }
    if (
      toInt(cur.matches) !== exp.matches ||
      toInt(cur.wins) !== exp.wins ||
      toInt(cur.losses) !== exp.losses ||
      toInt(cur.unique_players) !== exp.unique_players
    ) {
      errors.push(
        `agg_daily_team mismatch ${k}: cur(${cur.matches}/${cur.wins}/${cur.losses}/${cur.unique_players}) != exp(${exp.matches}/${exp.wins}/${exp.losses}/${exp.unique_players})`
      );
    }
  }
  if (!teamFilter) {
    for (const k of aggTeamMap.keys()) {
      if (!expectedTeamMap.has(k)) warnings.push(`agg_daily_team extra key: ${k}`);
    }
  }

  const report = {
    generated_at: new Date().toISOString(),
    paths: {
      fact: FACT_PATH,
      agg_player: AGG_PLAYER_PATH,
      agg_team: AGG_TEAM_PATH,
    },
    scope: {
      teams: teamFilter ? [...teamFilter] : null,
    },
    totals: {
      fact_rows: facts.length,
      agg_player_rows: aggPlayer.length,
      agg_team_rows: aggTeam.length,
      expected_agg_player_rows: expected.playerRows.length,
      expected_agg_team_rows: expected.teamRows.length,
    },
    status: errors.length ? "fail" : "pass",
    errors,
    warnings,
  };

  fs.mkdirSync(path.dirname(REPORT_PATH), { recursive: true });
  fs.writeFileSync(REPORT_PATH, JSON.stringify(report, null, 2), "utf8");
  console.log(JSON.stringify(report, null, 2));
  process.exit(errors.length ? 1 : 0);
}

main();
