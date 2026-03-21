const fs = require("fs");
const path = require("path");
const crypto = require("crypto");

const ROOT = path.resolve(__dirname, "..", "..");
const TMP_DIR = path.join(ROOT, "tmp");
const WAREHOUSE_DIR = path.join(ROOT, "data", "warehouse");
const CACHE_DIR = path.join(TMP_DIR, ".cache");

const FACT_PATH = path.join(WAREHOUSE_DIR, "fact_matches.csv");
const DIM_PATH = path.join(WAREHOUSE_DIR, "dim_player_roster_history.csv");
const AGG_PLAYER_PATH = path.join(WAREHOUSE_DIR, "agg_daily_player.csv");
const AGG_TEAM_PATH = path.join(WAREHOUSE_DIR, "agg_daily_team.csv");
const REPORT_PATH = path.join(TMP_DIR, "warehouse_build_report.json");
const STATE_PATH = path.join(CACHE_DIR, "warehouse_state.json");
const PROJECTS_DIR = path.join(ROOT, "data", "metadata", "projects");

const FACT_HEADERS = [
  "match_key",
  "match_date",
  "player_entity_id",
  "player_name",
  "team",
  "tier",
  "race",
  "opponent_name",
  "opponent_race",
  "map_name",
  "result",
  "is_win",
  "memo",
  "source_file",
  "source_row_no",
  "ingested_at",
];

const DIM_HEADERS = [
  "entity_id",
  "player_name",
  "team",
  "tier",
  "race",
  "valid_from",
  "valid_to",
  "updated_at",
  "source",
];

const AGG_PLAYER_HEADERS = [
  "match_date",
  "player_entity_id",
  "player_name",
  "team",
  "tier",
  "race",
  "matches",
  "wins",
  "losses",
  "win_rate",
];

const AGG_TEAM_HEADERS = [
  "match_date",
  "team",
  "matches",
  "wins",
  "losses",
  "win_rate",
  "unique_players",
];

function argValue(flag, fallback = null) {
  const idx = process.argv.indexOf(flag);
  if (idx >= 0 && process.argv[idx + 1]) return process.argv[idx + 1];
  return fallback;
}

function hasFlag(flag) {
  return process.argv.includes(flag);
}

function ensureDir(dirPath) {
  fs.mkdirSync(dirPath, { recursive: true });
}

function csvEscape(v) {
  const s = String(v ?? "");
  if (/[",\r\n]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
  return s;
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

function readCsv(filePath) {
  if (!fs.existsSync(filePath)) return [];
  const raw = fs.readFileSync(filePath, "utf8").replace(/^\uFEFF/, "");
  const lines = raw.split(/\r?\n/).filter((l) => l.length > 0);
  if (lines.length === 0) return [];
  const headers = parseCsvLine(lines[0]);
  return lines.slice(1).map((line) => {
    const cols = parseCsvLine(line);
    const row = {};
    headers.forEach((h, i) => {
      row[h] = cols[i] ?? "";
    });
    return row;
  });
}

function writeCsv(filePath, headers, rows) {
  ensureDir(path.dirname(filePath));
  const lines = [headers.join(",")];
  for (const row of rows) {
    lines.push(headers.map((h) => csvEscape(row[h])).join(","));
  }
  fs.writeFileSync(filePath, "\uFEFF" + lines.join("\n"), "utf8");
}

function toBool(s) {
  return String(s).toLowerCase() === "true" || String(s) === "1";
}

function toInt(s) {
  const n = Number(s);
  return Number.isFinite(n) ? Math.trunc(n) : 0;
}

function toWinRate(wins, total) {
  if (!total) return "0.00";
  return ((wins / total) * 100).toFixed(2);
}

function isIsoDate(v) {
  return /^\d{4}-\d{2}-\d{2}$/.test(String(v || ""));
}

function hashMatch(parts) {
  return crypto.createHash("sha1").update(parts.join("|"), "utf8").digest("hex");
}

function normalizePlayerNameFromFileName(fileName) {
  return fileName
    .replace(/_상세전적_\d{4}-\d{2}-\d{2}_\d{4}-\d{2}-\d{2}\.csv$/, "")
    .replace(/_상세전적\.csv$/, "");
}

function readJson(filePath, fallback) {
  if (!fs.existsSync(filePath)) return fallback;
  return JSON.parse(fs.readFileSync(filePath, "utf8").replace(/^\uFEFF/, ""));
}

function buildRosterIndexFromProjects() {
  const byName = new Map();
  const byEntityId = new Map();
  const duplicateEntityIds = new Set();
  if (!fs.existsSync(PROJECTS_DIR)) {
    return { byName, byEntityId, duplicateEntityIds };
  }

  const dirs = fs
    .readdirSync(PROJECTS_DIR, { withFileTypes: true })
    .filter((d) => d.isDirectory())
    .map((d) => d.name)
    .sort((a, b) => String(a).localeCompare(String(b)));

  for (const code of dirs) {
    const rosterPath = path.join(PROJECTS_DIR, code, `players.${code}.v1.json`);
    const json = readJson(rosterPath, { roster: [] });
    for (const row of json.roster || []) {
      const name = String(row.name || "").trim();
      const entityId = String(row.entity_id || "").trim();
      if (!name || !entityId) continue;
      if (byEntityId.has(entityId)) {
        duplicateEntityIds.add(entityId);
        continue;
      }
      const canonical = {
        ...row,
        __team_code: String(row.team_code || code || "").trim() || code,
      };
      byEntityId.set(entityId, canonical);
      if (!byName.has(name)) byName.set(name, canonical);
    }
  }
  return { byName, byEntityId, duplicateEntityIds };
}

function listSourceCsvFiles() {
  if (!fs.existsSync(TMP_DIR)) return [];
  const candidates = [];
  const stack = [TMP_DIR];
  while (stack.length) {
    const dir = stack.pop();
    const entries = fs.readdirSync(dir, { withFileTypes: true });
    for (const ent of entries) {
      const abs = path.join(dir, ent.name);
      if (ent.isDirectory()) {
        stack.push(abs);
        continue;
      }
      if (/_상세전적(?:_\d{4}-\d{2}-\d{2}_\d{4}-\d{2}-\d{2})?\.csv$/.test(ent.name)) {
        const stable = /_상세전적\.csv$/.test(ent.name);
        const range = stable
          ? null
          : ent.name.match(/_상세전적_(\d{4}-\d{2}-\d{2})_(\d{4}-\d{2}-\d{2})\.csv$/);
        candidates.push({
          path: abs,
          player: normalizePlayerNameFromFileName(ent.name),
          stable,
          from: range ? range[1] : "",
          to: range ? range[2] : "",
          mtime: fs.statSync(abs).mtimeMs,
        });
      }
    }
  }
  // Choose exactly one source CSV per player.
  // Priority:
  // 1) stable file (*_상세전적.csv)
  // 2) latest ranged file by to/from date (then mtime)
  const byPlayer = new Map();
  for (const c of candidates) {
    if (!byPlayer.has(c.player)) byPlayer.set(c.player, []);
    byPlayer.get(c.player).push(c);
  }

  const selected = [];
  for (const rows of byPlayer.values()) {
    const stables = rows.filter((r) => r.stable).sort((a, b) => b.mtime - a.mtime);
    if (stables.length) {
      selected.push(stables[0].path);
      continue;
    }
    const ranged = rows.slice().sort((a, b) => {
      if (a.to !== b.to) return String(b.to).localeCompare(String(a.to));
      if (a.from !== b.from) return String(b.from).localeCompare(String(a.from));
      return b.mtime - a.mtime;
    });
    if (ranged.length) selected.push(ranged[0].path);
  }

  return selected.sort();
}

function buildState(files) {
  const out = {};
  for (const filePath of files) {
    const st = fs.statSync(filePath);
    out[filePath] = {
      mtime_ms: st.mtimeMs,
      size: st.size,
    };
  }
  return out;
}

function changedFiles(files, prevState) {
  const changed = [];
  for (const f of files) {
    if (!fs.existsSync(f)) continue;
    const st = fs.statSync(f);
    const prev = prevState[f];
    if (!prev || prev.mtime_ms !== st.mtimeMs || prev.size !== st.size) changed.push(f);
  }
  return changed;
}

function ensureDimRows(dimRows, entityById, nowIso) {
  const seen = new Set(
    dimRows.map(
      (r) => `${r.entity_id}|${r.team}|${r.tier}|${r.race}|${r.valid_from}|${r.valid_to || ""}`
    )
  );
  let inserted = 0;
  for (const row of entityById.values()) {
    const teamCode = String(row.__team_code || row.team_code || "").trim() || "unknown";
    const key = `${row.entity_id}|${teamCode}|${row.tier}|${row.race}|1900-01-01|`;
    if (seen.has(key)) continue;
    dimRows.push({
      entity_id: row.entity_id,
      player_name: row.name,
      team: teamCode,
      tier: row.tier,
      race: row.race,
      valid_from: "1900-01-01",
      valid_to: "",
      updated_at: nowIso,
      source: "metadata:project_roster",
    });
    inserted += 1;
  }
  return inserted;
}

function resolveRoster(dimRows, entityId, matchDate) {
  const rows = dimRows
    .filter((r) => r.entity_id === entityId)
    .filter((r) => {
      const fromOk = !r.valid_from || r.valid_from <= matchDate;
      const toOk = !r.valid_to || r.valid_to >= matchDate;
      return fromOk && toOk;
    })
    .sort((a, b) => String(b.valid_from || "").localeCompare(String(a.valid_from || "")));
  return rows[0] || null;
}

function recalcPlayerAggForDates(factRows, dimRows, targetDates, existingRows) {
  const dateSet = new Set(targetDates);
  const keep = existingRows.filter((r) => !dateSet.has(r.match_date));
  const grouped = new Map();

  for (const m of factRows) {
    if (!dateSet.has(m.match_date)) continue;
    const roster = resolveRoster(dimRows, m.player_entity_id, m.match_date);
    const team = roster?.team || m.team || "";
    const tier = roster?.tier || m.tier || "";
    const race = roster?.race || m.race || "";
    const key = `${m.match_date}|${m.player_entity_id}`;
    if (!grouped.has(key)) {
      grouped.set(key, {
        match_date: m.match_date,
        player_entity_id: m.player_entity_id,
        player_name: m.player_name,
        team,
        tier,
        race,
        matches: 0,
        wins: 0,
        losses: 0,
        win_rate: "0.00",
      });
    }
    const g = grouped.get(key);
    g.matches += 1;
    if (toBool(m.is_win)) g.wins += 1;
    else g.losses += 1;
  }

  const recalc = [...grouped.values()].map((r) => ({
    ...r,
    matches: String(r.matches),
    wins: String(r.wins),
    losses: String(r.losses),
    win_rate: toWinRate(r.wins, r.matches),
  }));

  return [...keep, ...recalc].sort((a, b) =>
    `${a.match_date}|${a.player_entity_id}`.localeCompare(`${b.match_date}|${b.player_entity_id}`)
  );
}

function recalcTeamAggForDates(playerAggRows, targetDates, existingRows) {
  const dateSet = new Set(targetDates);
  const keep = existingRows.filter((r) => !dateSet.has(r.match_date));
  const grouped = new Map();

  for (const row of playerAggRows) {
    if (!dateSet.has(row.match_date)) continue;
    const key = `${row.match_date}|${row.team}`;
    if (!grouped.has(key)) {
      grouped.set(key, {
        match_date: row.match_date,
        team: row.team,
        matches: 0,
        wins: 0,
        losses: 0,
        unique_players_set: new Set(),
      });
    }
    const g = grouped.get(key);
    g.matches += toInt(row.matches);
    g.wins += toInt(row.wins);
    g.losses += toInt(row.losses);
    g.unique_players_set.add(row.player_entity_id);
  }

  const recalc = [...grouped.values()].map((r) => ({
    match_date: r.match_date,
    team: r.team,
    matches: String(r.matches),
    wins: String(r.wins),
    losses: String(r.losses),
    win_rate: toWinRate(r.wins, r.matches),
    unique_players: String(r.unique_players_set.size),
  }));

  return [...keep, ...recalc].sort((a, b) =>
    `${a.match_date}|${a.team}`.localeCompare(`${b.match_date}|${b.team}`)
  );
}

function main() {
  const nowIso = new Date().toISOString();
  const rebuild = hasFlag("--rebuild");
  const from = argValue("--from", "1900-01-01");
  const to = argValue("--to", "9999-12-31");

  ensureDir(WAREHOUSE_DIR);
  ensureDir(CACHE_DIR);

  const allSourceFiles = listSourceCsvFiles();
  const prevState = readJson(STATE_PATH, {});
  const sourceFiles = rebuild ? allSourceFiles : changedFiles(allSourceFiles, prevState);
  const rosterIndex = buildRosterIndexFromProjects();
  const entityMap = rosterIndex.byName;

  const factRows = rebuild ? [] : readCsv(FACT_PATH);
  const dimRows = readCsv(DIM_PATH);
  const aggPlayerRows = rebuild ? [] : readCsv(AGG_PLAYER_PATH);
  const aggTeamRows = rebuild ? [] : readCsv(AGG_TEAM_PATH);

  const existingFactKeys = new Set(factRows.map((r) => r.match_key));
  const changedDates = new Set();
  const unknownPlayers = new Set();
  let skippedInvalidDateRows = 0;
  let insertedFacts = 0;
  let replacedFacts = 0;

  // For changed source files, replace that file/player slice to support
  // row-level corrections and legitimate duplicated match signatures.
  if (!rebuild && sourceFiles.length) {
    for (const filePath of sourceFiles) {
      const fileName = path.basename(filePath);
      const playerName = normalizePlayerNameFromFileName(fileName);
      const entity = entityMap.get(playerName);
      if (!entity) {
        unknownPlayers.add(playerName);
        continue;
      }

      const before = factRows.length;
      const removed = [];
      for (let i = factRows.length - 1; i >= 0; i -= 1) {
        const row = factRows[i];
        if (row.source_file === fileName && row.player_entity_id === entity.entity_id) {
          removed.push(row);
          factRows.splice(i, 1);
        }
      }
      replacedFacts += before - factRows.length;
      for (const r of removed) changedDates.add(r.match_date);
    }
  }

  existingFactKeys.clear();
  for (const row of factRows) existingFactKeys.add(row.match_key);

  for (const filePath of sourceFiles) {
    const fileName = path.basename(filePath);
    const playerName = normalizePlayerNameFromFileName(fileName);
    const entity = entityMap.get(playerName);
    if (!entity) {
      unknownPlayers.add(playerName);
      continue;
    }

    const teamCode = String(entity.__team_code || entity.team_code || "").trim() || "unknown";

    const rows = readCsv(filePath);
    let sourceRowNo = 0;

    for (const r of rows) {
      sourceRowNo += 1;
      const matchDate = String(r["날짜"] || "").trim();
      if (!matchDate || !isIsoDate(matchDate)) {
        skippedInvalidDateRows += 1;
        continue;
      }
      if (matchDate < from || matchDate > to) continue;

      const opponentName = String(r["상대명"] || "").trim();
      const opponentRace = String(r["상대종족"] || "").trim();
      const mapName = String(r["맵"] || "").trim();
      const result = String(r["경기결과(승/패)"] || "").trim();
      const memo = String(r["메모"] || "").trim();
      const isWin = result === "승";
      // Keep raw row granularity from source CSV as-is.
      // Do not collapse by match signature; each source row is one match.
      const matchKey = hashMatch([
        `src:${fileName}`,
        `entity:${entity.entity_id}`,
        `row:${sourceRowNo}`,
      ]);
      if (existingFactKeys.has(matchKey)) continue;
      existingFactKeys.add(matchKey);

      factRows.push({
        match_key: matchKey,
        match_date: matchDate,
        player_entity_id: entity.entity_id,
        player_name: playerName,
        team: teamCode,
        tier: entity.tier || "",
        race: entity.race || "",
        opponent_name: opponentName,
        opponent_race: opponentRace,
        map_name: mapName,
        result,
        is_win: String(isWin),
        memo,
        source_file: fileName,
        source_row_no: String(sourceRowNo),
        ingested_at: nowIso,
      });
      insertedFacts += 1;
      changedDates.add(matchDate);
    }
  }

  const insertedDim = ensureDimRows(dimRows, rosterIndex.byEntityId, nowIso);

  const fullRecalcDates =
    rebuild || !fs.existsSync(AGG_PLAYER_PATH) || !fs.existsSync(AGG_TEAM_PATH)
      ? [...new Set(factRows.map((r) => r.match_date))]
      : [...changedDates];

  const nextAggPlayer = fullRecalcDates.length
    ? recalcPlayerAggForDates(factRows, dimRows, fullRecalcDates, aggPlayerRows)
    : aggPlayerRows;
  const nextAggTeam = fullRecalcDates.length
    ? recalcTeamAggForDates(nextAggPlayer, fullRecalcDates, aggTeamRows)
    : aggTeamRows;

  factRows.sort((a, b) => `${a.match_date}|${a.player_entity_id}|${a.match_key}`.localeCompare(`${b.match_date}|${b.player_entity_id}|${b.match_key}`));
  dimRows.sort((a, b) => `${a.entity_id}|${a.valid_from}|${a.valid_to}`.localeCompare(`${b.entity_id}|${b.valid_from}|${b.valid_to}`));

  writeCsv(FACT_PATH, FACT_HEADERS, factRows);
  writeCsv(DIM_PATH, DIM_HEADERS, dimRows);
  writeCsv(AGG_PLAYER_PATH, AGG_PLAYER_HEADERS, nextAggPlayer);
  writeCsv(AGG_TEAM_PATH, AGG_TEAM_HEADERS, nextAggTeam);

  const nextState = buildState(allSourceFiles);
  fs.writeFileSync(STATE_PATH, JSON.stringify(nextState, null, 2), "utf8");

  const report = {
    generated_at: nowIso,
    mode: rebuild ? "rebuild" : "incremental",
    source_csv_total: allSourceFiles.length,
    source_csv_scanned: sourceFiles.length,
    fact_replaced: replacedFacts,
    fact_inserted: insertedFacts,
    fact_total: factRows.length,
    dim_inserted: insertedDim,
    dim_total: dimRows.length,
    unresolved_source_players: [...unknownPlayers].sort((a, b) => String(a).localeCompare(String(b))),
    unresolved_source_players_count: unknownPlayers.size,
    duplicate_entity_id_count: rosterIndex.duplicateEntityIds.size,
    skipped_invalid_date_rows: skippedInvalidDateRows,
    agg_recalc_dates: fullRecalcDates.length,
    agg_player_total: nextAggPlayer.length,
    agg_team_total: nextAggTeam.length,
    paths: {
      fact: FACT_PATH,
      dim: DIM_PATH,
      agg_player: AGG_PLAYER_PATH,
      agg_team: AGG_TEAM_PATH,
      state: STATE_PATH,
    },
  };

  fs.writeFileSync(REPORT_PATH, JSON.stringify(report, null, 2), "utf8");
  console.log(JSON.stringify(report, null, 2));
}

main();
