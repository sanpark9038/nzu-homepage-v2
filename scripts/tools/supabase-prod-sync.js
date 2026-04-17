const fs = require('fs');
const path = require('path');
const { createClient } = require('@supabase/supabase-js');
require('dotenv').config({ path: path.join(__dirname, '..', '..', '.env.local') });

const ROOT = path.join(__dirname, '..', '..');
const PROJECTS_DIR = path.join(ROOT, 'data', 'metadata', 'projects');
const EXCLUSIONS_FILE = path.join(ROOT, 'data', 'metadata', 'pipeline_collection_exclusions.v1.json');
const FACT_MATCHES_PATH = path.join(ROOT, 'data', 'warehouse', 'fact_matches.csv');
const TMP_DIR = path.join(ROOT, 'tmp');
const PLAYER_METADATA_PATH = path.join(ROOT, 'scripts', 'player_metadata.json');
const SOOP_MAPPINGS_PATH = path.join(ROOT, 'data', 'metadata', 'soop_channel_mappings.v1.json');
const SOOP_REVIEW_DECISIONS_PATH = path.join(ROOT, 'data', 'metadata', 'soop_manual_review_decisions.v1.json');
const DEBUG_PAYLOAD_PATH = path.join(TMP_DIR, 'supabase_prod_sync_payload_preview.json');

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || '';
const supabaseServiceRoleKey =
  process.env.SUPABASE_SERVICE_ROLE_KEY ||
  process.env.SUPABASE_SERVICE_KEY ||
  '';

if (!supabaseUrl || !supabaseServiceRoleKey) {
  throw new Error(
    'Supabase production sync requires NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY (or SUPABASE_SERVICE_KEY).'
  );
}

const supabase = createClient(supabaseUrl, supabaseServiceRoleKey);
const DEFAULT_UPSERT_CHUNK_SIZE = 25;
const MIN_UPSERT_CHUNK_SIZE = 1;

function normalizeName(value) {
  return String(value || '').trim();
}

function normalizeLookupName(value) {
  return normalizeName(value).toLowerCase();
}

function extractWrId(value) {
  const raw = String(value || '').trim();
  if (!raw) return null;
  if (/^\d+$/.test(raw)) return raw;
  const match = raw.match(/(\d+)$/);
  return match ? match[1] : null;
}

function isMixEntityId(value) {
  return /^eloboard:(male|female):mix:\d+$/i.test(String(value || '').trim());
}

function readJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, 'utf8').replace(/^\uFEFF/, ''));
}

function readJsonIfExists(filePath, fallback) {
  if (!fs.existsSync(filePath)) return fallback;
  return readJson(filePath);
}

function buildSoopLookup() {
  const empty = {
    lookup: new Map(),
    byWrId: new Map(),
    byNameGender: new Map(),
    byName: new Map(),
  };
  if (!fs.existsSync(PLAYER_METADATA_PATH)) return empty;
  const rows = readJson(PLAYER_METADATA_PATH);
  if (!Array.isArray(rows)) return empty;
  const lookup = new Map();
  const byWrId = new Map();
  const byNameGenderBuckets = new Map();
  const byNameBuckets = new Map();

  const registerNamePayload = (nameValue, payload) => {
    const normalized = normalizeLookupName(nameValue);
    if (!normalized || !payload || !payload.soop_id) return;
    const bucket = byNameBuckets.get(normalized) || [];
    bucket.push(payload);
    byNameBuckets.set(normalized, bucket);
  };

  for (const row of rows) {
    const wrId = Number(row && row.wr_id);
    const gender = String(row && row.gender ? row.gender : '').trim().toLowerCase();
    const soopUserId = String(row && row.soop_user_id ? row.soop_user_id : '').trim();
    const name = normalizeLookupName(row && row.name ? row.name : '');
    if (!Number.isFinite(wrId) || !gender || !soopUserId) continue;
    const payload = {
      name,
      soop_id: soopUserId,
      broadcast_url: `https://ch.sooplive.co.kr/${soopUserId}`,
    };
    lookup.set(`${wrId}:${gender}`, payload);
    byWrId.set(String(wrId), payload);
    if (name) {
      const key = `${name}:${gender}`;
      const bucket = byNameGenderBuckets.get(key) || [];
      bucket.push(payload);
      byNameGenderBuckets.set(key, bucket);
    }
    registerNamePayload(name, payload);
  }

  const mappingsDoc = readJsonIfExists(SOOP_MAPPINGS_PATH, {});
  const aliases = mappingsDoc && typeof mappingsDoc.aliases === 'object' ? mappingsDoc.aliases : {};
  const mappings = Array.isArray(mappingsDoc && mappingsDoc.mappings) ? mappingsDoc.mappings : [];
  for (const row of mappings) {
    const soopUserId = String(row && row.soop_user_id ? row.soop_user_id : '').trim();
    const rawName = normalizeName(row && row.name ? row.name : '');
    if (!rawName || !soopUserId) continue;
    const payload = {
      name: normalizeLookupName(aliases[rawName] || rawName),
      soop_id: soopUserId,
      broadcast_url: `https://ch.sooplive.co.kr/${soopUserId}`,
    };
    registerNamePayload(rawName, payload);
    registerNamePayload(aliases[rawName] || '', payload);
  }

  const reviewDoc = readJsonIfExists(SOOP_REVIEW_DECISIONS_PATH, {});
  const decisions = Array.isArray(reviewDoc && reviewDoc.decisions) ? reviewDoc.decisions : [];
  for (const row of decisions) {
    const decision = String(row && row.decision ? row.decision : '').trim().toLowerCase();
    const soopUserId = String(row && row.soop_user_id ? row.soop_user_id : '').trim();
    if (decision !== 'include' || !soopUserId) continue;
    const payload = {
      name: normalizeLookupName(row && (row.canonical_name || row.source_name) ? (row.canonical_name || row.source_name) : ''),
      soop_id: soopUserId,
      broadcast_url: `https://ch.sooplive.co.kr/${soopUserId}`,
    };
    registerNamePayload(row && row.source_name ? row.source_name : '', payload);
    registerNamePayload(row && row.canonical_name ? row.canonical_name : '', payload);
    for (const alias of Array.isArray(row && row.alias_names) ? row.alias_names : []) {
      registerNamePayload(alias, payload);
    }
  }

  const byNameGender = new Map();
  for (const [key, bucket] of byNameGenderBuckets.entries()) {
    const uniquePayloads = bucket.filter(
      (payload, index, arr) =>
        arr.findIndex((candidate) => candidate.soop_id === payload.soop_id) === index
    );
    if (uniquePayloads.length === 1) {
      byNameGender.set(key, uniquePayloads[0]);
    }
  }
  const byName = new Map();
  for (const [key, bucket] of byNameBuckets.entries()) {
    const uniquePayloads = bucket.filter(
      (payload, index, arr) =>
        arr.findIndex((candidate) => candidate.soop_id === payload.soop_id) === index
    );
    if (uniquePayloads.length === 1) {
      byName.set(key, uniquePayloads[0]);
    }
  }
  return { lookup, byWrId, byNameGender, byName };
}

function resolveSoopServingMetadata(row, soopLookup) {
  const entityId = String(row && row.eloboard_id ? row.eloboard_id : '').trim();
  const wrId = extractWrId(entityId);
  const gender = String(row && row.gender ? row.gender : '').trim().toLowerCase();
  const name = normalizeLookupName(row && row.name ? row.name : '');
  if (wrId && gender) {
    const exact = soopLookup.lookup.get(`${wrId}:${gender}`);
    if (exact) {
      return {
        soop_id: exact.soop_id,
        broadcast_url: exact.broadcast_url,
      };
    }
  }
  if (wrId && isMixEntityId(entityId)) {
    const mixFallback = soopLookup.byWrId.get(wrId);
    if (mixFallback) {
      return {
        soop_id: mixFallback.soop_id,
        broadcast_url: mixFallback.broadcast_url,
      };
    }
  }
  if (name && gender) {
    const sameName = soopLookup.byNameGender.get(`${name}:${gender}`);
    if (sameName) {
      return {
        soop_id: sameName.soop_id,
        broadcast_url: sameName.broadcast_url,
      };
    }
  }
  if (name) {
    const byName = soopLookup.byName.get(name);
    if (byName) {
      return {
        soop_id: byName.soop_id,
        broadcast_url: byName.broadcast_url,
      };
    }
  }
  return { soop_id: null, broadcast_url: null };
}

function parseCsvLine(line) {
  const out = [];
  let cur = '';
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
    } else if (ch === ',') {
      out.push(cur);
      cur = '';
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
  const raw = fs.readFileSync(filePath, 'utf8').replace(/^\uFEFF/, '');
  const records = splitCsvRecords(raw);
  if (!records.length) return [];
  const headers = parseCsvLine(records[0]);
  return records.slice(1).map((line) => {
    const cols = parseCsvLine(line);
    const row = {};
    headers.forEach((header, index) => {
      row[header] = cols[index] ?? '';
    });
    return row;
  });
}

function sourceCsvPath(sourceFile) {
  const name = String(sourceFile || '').trim();
  if (!name) return null;
  const fullPath = path.join(TMP_DIR, name);
  if (!fs.existsSync(fullPath)) return null;
  return fullPath;
}

function normalizeRaceCode(value) {
  const raw = String(value || '').trim().toUpperCase();
  if (raw.startsWith('Z')) return 'Z';
  if (raw.startsWith('P')) return 'P';
  if (raw.startsWith('T')) return 'T';
  if (raw.startsWith('ZERG')) return 'Z';
  if (raw.startsWith('PROTOSS')) return 'P';
  if (raw.startsWith('TERRAN')) return 'T';
  return null;
}

function toBool(value) {
  const raw = String(value || '').trim().toLowerCase();
  return raw === 'true' || raw === '1';
}

function toPercent(wins, total) {
  if (!total) return 0;
  return Number(((wins / total) * 100).toFixed(2));
}

function resolveInitialChunkSize() {
  const raw = Number(process.env.SUPABASE_PROD_SYNC_CHUNK_SIZE || DEFAULT_UPSERT_CHUNK_SIZE);
  if (!Number.isInteger(raw) || raw <= 0) return DEFAULT_UPSERT_CHUNK_SIZE;
  return raw;
}

function isStatementTimeout(error) {
  const code = String(error && error.code ? error.code : '').trim();
  const message = String(error && error.message ? error.message : '').toLowerCase();
  return code === '57014' || message.includes('statement timeout') || message.includes('canceling statement due to statement timeout');
}

async function upsertPlayersChunkAdaptive(rows) {
  if (!Array.isArray(rows) || rows.length === 0) return;

  const { error } = await supabase.from('players').upsert(rows, { onConflict: 'name' });
  if (!error) return;

  if (!isStatementTimeout(error) || rows.length <= MIN_UPSERT_CHUNK_SIZE) {
    throw new Error(`Error upserting to players: ${JSON.stringify(error)}`);
  }

  const mid = Math.ceil(rows.length / 2);
  const left = rows.slice(0, mid);
  const right = rows.slice(mid);
  console.warn(`[retry] players upsert timeout on chunk=${rows.length}; splitting into ${left.length}+${right.length}`);
  await upsertPlayersChunkAdaptive(left);
  await upsertPlayersChunkAdaptive(right);
}

function parseMatchHistoryFromStableCsv(sourceFile) {
  const filePath = sourceCsvPath(sourceFile);
  if (!filePath) return null;
  const rows = readCsv(filePath);
  if (!rows.length) return [];
  return rows.map((row) => {
    const result = String(row['경기결과(승/패)'] || '').trim();
    return {
      match_date: row['날짜'] || null,
      opponent_name: normalizeName(row['상대명']),
      opponent_race: normalizeRaceCode(row['상대종족']),
      map_name: row['맵'] || null,
      is_win: result === '승',
      result_text: result || null,
      note: row['메모'] || null,
      source_file: String(sourceFile || '').trim() || null,
      source_row_no: null,
    };
  });
}

function buildStableCsvIndex() {
  if (!fs.existsSync(TMP_DIR)) return new Map();
  const byWrId = new Map();
  for (const fileName of fs.readdirSync(TMP_DIR)) {
    const mixMatch = fileName.match(/^eloboard_(male|female)_mix_(\d+)_/i);
    const defaultMatch = fileName.match(/^eloboard_(male|female)_(\d+)_/i);
    const match = mixMatch || defaultMatch;
    if (!match || !fileName.toLowerCase().endsWith('.csv')) continue;
    const entry = {
      fileName,
      gender: String(match[1] || '').toLowerCase(),
      wrId: String(match[2] || ''),
      isMix: Boolean(mixMatch),
    };
    const bucket = byWrId.get(entry.wrId) || [];
    bucket.push(entry);
    byWrId.set(entry.wrId, bucket);
  }
  return byWrId;
}

function findStableCsvSourceFile(playerRow, stableCsvIndex) {
  const wrId = extractWrId(playerRow && playerRow.eloboard_id);
  if (!wrId) return null;
  const candidates = stableCsvIndex.get(String(wrId)) || [];
  if (!candidates.length) return null;

  const entityId = String(playerRow && playerRow.eloboard_id ? playerRow.eloboard_id : '').trim();
  const gender = String(playerRow && playerRow.gender ? playerRow.gender : '').trim().toLowerCase();
  const wantsMix = isMixEntityId(entityId);

  const exact = candidates.find((candidate) => candidate.gender === gender && candidate.isMix === wantsMix);
  if (exact) return exact.fileName;

  const sameGender = candidates.find((candidate) => candidate.gender === gender);
  if (sameGender) return sameGender.fileName;

  return candidates[0].fileName;
}

function buildDetailedStats(history) {
  const race_stats = {
    T: { w: 0, l: 0 },
    Z: { w: 0, l: 0 },
    P: { w: 0, l: 0 },
  };
  const map_stats = {};
  const last_10 = history.slice(0, 10).map((item) => (item.is_win ? 'W' : 'L'));

  for (const item of history) {
    const race = normalizeRaceCode(item.opponent_race);
    if (race && race_stats[race]) {
      if (item.is_win) race_stats[race].w += 1;
      else race_stats[race].l += 1;
    }

    const mapName = String(item.map_name || '').trim();
    if (mapName) {
      if (!map_stats[mapName]) map_stats[mapName] = { w: 0, l: 0 };
      if (item.is_win) map_stats[mapName].w += 1;
      else map_stats[mapName].l += 1;
    }
  }

  const total = history.length;
  const wins = history.filter((item) => item.is_win).length;

  return {
    race_stats,
    map_stats,
    last_10,
    win_rate: toPercent(wins, total),
  };
}

function buildServingStatsByName(players = []) {
  const rows = readCsv(FACT_MATCHES_PATH);
  const byName = new Map();
  const sourceFileByName = new Map();
  const stableCsvIndex = buildStableCsvIndex();

  for (const row of rows) {
    const name = normalizeName(row.player_name);
    if (!name) continue;
    if (!sourceFileByName.has(name)) {
      sourceFileByName.set(name, String(row.source_file || '').trim());
    }
    const entry = byName.get(name) || {
      wins: 0,
      losses: 0,
      history: [],
    };
    const isWin = toBool(row.is_win);
    if (isWin) entry.wins += 1;
    else entry.losses += 1;
    entry.history.push({
      match_date: row.match_date || null,
      opponent_name: normalizeName(row.opponent_name),
      opponent_race: normalizeRaceCode(row.opponent_race),
      map_name: row.map_name || null,
      is_win: isWin,
      result_text: row.result || null,
      note: row.memo || null,
      source_file: row.source_file || null,
      source_row_no: Number(row.source_row_no || 0) || null,
    });
    byName.set(name, entry);
  }

  for (const [name, entry] of byName.entries()) {
    const stableHistory = parseMatchHistoryFromStableCsv(sourceFileByName.get(name));
    if (Array.isArray(stableHistory) && stableHistory.length) {
      entry.history = stableHistory;
      entry.wins = stableHistory.filter((item) => item.is_win).length;
      entry.losses = stableHistory.length - entry.wins;
      continue;
    }
    entry.history.sort((a, b) => {
      const byDate = String(b.match_date || '').localeCompare(String(a.match_date || ''));
      if (byDate !== 0) return byDate;
      return Number(a.source_row_no || 0) - Number(b.source_row_no || 0);
    });
  }

  for (const player of Array.isArray(players) ? players : []) {
    const name = normalizeName(player && player.name ? player.name : '');
    if (!name || byName.has(name)) continue;
    const stableSourceFile = findStableCsvSourceFile(player, stableCsvIndex);
    const stableHistory = parseMatchHistoryFromStableCsv(stableSourceFile);
    if (!Array.isArray(stableHistory) || !stableHistory.length) continue;
    const wins = stableHistory.filter((item) => item.is_win).length;
    byName.set(name, {
      wins,
      losses: stableHistory.length - wins,
      history: stableHistory,
    });
  }

  return byName;
}

function loadExpectedLocalVisibleCount() {
  const exclusionsData = fs.existsSync(EXCLUSIONS_FILE) ? readJson(EXCLUSIONS_FILE) : { players: [] };
  const exclusionRules = (exclusionsData.players || []).map((p) => {
    const wrId = Number(p && p.wr_id);
    const name = String(p && p.name ? p.name : '').trim().toLowerCase();
    const entityId = String(p && p.entity_id ? p.entity_id : '').trim();
    return {
      entity_id: entityId || null,
      wr_id: Number.isFinite(wrId) && wrId > 0 ? wrId : null,
      name: name || null,
    };
  });

  const shouldExclude = (player) => {
    const entityId = String(player && player.entity_id ? player.entity_id : '').trim();
    const wrId = Number(entityId.split(':').pop());
    const name = String(player && player.name ? player.name : '').trim().toLowerCase();
    return exclusionRules.some((rule) => {
      if (!rule) return false;
      if (rule.entity_id) return entityId === rule.entity_id;
      if (rule.wr_id && rule.name) return wrId === rule.wr_id && name === rule.name;
      if (rule.wr_id) return wrId === rule.wr_id;
      if (rule.name) return name === rule.name;
      return false;
    });
  };

  const names = new Set();
  const dirs = fs.existsSync(PROJECTS_DIR)
    ? fs.readdirSync(PROJECTS_DIR, { withFileTypes: true }).filter((d) => d.isDirectory())
    : [];
  for (const dir of dirs) {
    const filePath = path.join(PROJECTS_DIR, dir.name, `players.${dir.name}.v1.json`);
    if (!fs.existsSync(filePath)) continue;
    const doc = readJson(filePath);
    const roster = Array.isArray(doc.roster) ? doc.roster : [];
    for (const player of roster) {
      if (shouldExclude(player)) continue;
      const name = normalizeName(player && player.name ? player.name : '');
      if (name) names.add(name);
    }
  }
  return names.size;
}

async function main() {
  console.log('--- Production Sync Started ---');
  const soopLookup = buildSoopLookup();

  // 1) Fetch source from staging
  const { data: stagingData, error: stagingErr } = await supabase
    .from('players_staging')
    .select('eloboard_id,name,tier,race,university,gender,photo_url,is_live,last_checked_at,last_match_at,last_changed_at,check_priority,check_interval_days');
  if (stagingErr) throw stagingErr;
  const servingStatsByName = buildServingStatsByName(stagingData || []);

  const sanitized = (stagingData || [])
    .map((row) => ({
      ...resolveSoopServingMetadata(row, soopLookup),
      ...(servingStatsByName.get(String(row.name || '').trim()) ? (() => {
        const stats = servingStatsByName.get(String(row.name || '').trim());
        const totalMatches = Number(stats.wins || 0) + Number(stats.losses || 0);
        const matchHistory = stats.history.slice();
        return {
          detailed_stats: buildDetailedStats(matchHistory),
          match_history: matchHistory,
          total_wins: Number(stats.wins || 0),
          total_losses: Number(stats.losses || 0),
          win_rate: toPercent(Number(stats.wins || 0), totalMatches),
          last_synced_at: new Date().toISOString(),
        };
      })() : {
        detailed_stats: null,
        match_history: null,
        total_wins: 0,
        total_losses: 0,
        win_rate: 0,
        last_synced_at: new Date().toISOString(),
      }),
      eloboard_id: row.eloboard_id,
      name: String(row.name || '').trim(),
      tier: row.tier || '미정',
      race: row.race || null,
      university: row.university || '',
      gender: row.gender || null,
      photo_url: row.photo_url || null,
      is_live: Boolean(row.is_live),
      last_checked_at: row.last_checked_at || null,
      last_match_at: row.last_match_at || null,
      last_changed_at: row.last_changed_at || null,
      check_priority: row.check_priority || null,
      check_interval_days: Number.isFinite(Number(row.check_interval_days)) ? Number(row.check_interval_days) : null,
    }))
    .filter((row) => row.name.length > 0);

  if (!sanitized.length) {
    throw new Error('players_staging has no valid rows to sync.');
  }
  try {
    fs.mkdirSync(TMP_DIR, { recursive: true });
    fs.writeFileSync(DEBUG_PAYLOAD_PATH, JSON.stringify(sanitized.slice(0, 50), null, 2), 'utf8');
  } catch {}
  const expectedVisibleCount = loadExpectedLocalVisibleCount();
  if (expectedVisibleCount > 0 && sanitized.length < Math.floor(expectedVisibleCount * 0.8)) {
    throw new Error(
      `players_staging visible rows are unexpectedly low. expected_local_unique_names=${expectedVisibleCount}, actual=${sanitized.length}`
    );
  }

  console.log(`[+] Fetched ${sanitized.length} valid records from players_staging`);

  // 2) Fetch current production names for stale-delete phase
  const { data: prodData, error: prodErr } = await supabase.from('players').select('name');
  if (prodErr) throw prodErr;

  const validNames = new Set(sanitized.map((p) => p.name));

  // 3) Upsert all staging rows by unique key (name). Do not pass id.
  const chunkSize = resolveInitialChunkSize();
  for (let i = 0; i < sanitized.length; i += chunkSize) {
    const chunk = sanitized.slice(i, i + chunkSize);
    await upsertPlayersChunkAdaptive(chunk);
  }
  console.log(`[+] Upserted ${sanitized.length} records to players`);

  // 4) Delete stale rows not present in staging snapshot
  const toDelete = (prodData || []).filter((p) => !validNames.has(String(p.name || '')));
  console.log(`[!] Found ${toDelete.length} stale players not in local pipeline.`);

  if (toDelete.length > 0) {
    const namesToDelete = toDelete.map((d) => String(d.name || '')).filter(Boolean);
    for (let i = 0; i < namesToDelete.length; i += chunkSize) {
      const chunk = namesToDelete.slice(i, i + chunkSize);
      const { error: delErr } = await supabase.from('players').delete().in('name', chunk);
      if (delErr) {
        throw new Error(`Failed to delete stale players: ${delErr.message}`);
      }
    }
    console.log(`[-] Successfully removed ${namesToDelete.length} stale records.`);
  }

  // 5) Final verification
  const { count: finalCount, error: countErr } = await supabase
    .from('players')
    .select('*', { count: 'exact', head: true });
  if (countErr) throw countErr;

  console.log(`\n=== 본 반영 리포트 (Production Report) ===`);
  console.log(`[=] Production 'players' 최종 Row 수: ${finalCount}`);
  if (Number(finalCount) !== sanitized.length) {
    throw new Error(
      `Final count mismatch. expected=${sanitized.length}, actual=${finalCount}.`
    );
  }
  console.log('[+] Final count verification passed.');
  console.log('Done.');
}

if (require.main === module) {
  main().catch((error) => {
    console.error(error instanceof Error ? error.stack || error.message : String(error));
    process.exit(1);
  });
}

module.exports = {
  buildSoopLookup,
  buildServingStatsByName,
  parseCsvLine,
  parseMatchHistoryFromStableCsv,
  resolveSoopServingMetadata,
  readCsv,
  sourceCsvPath,
};
