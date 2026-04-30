const fs = require('fs');
const path = require('path');
const { createClient } = require('@supabase/supabase-js');
require('dotenv').config({ path: path.join(__dirname, '..', '..', '.env.local') });

const {
  tableHasColumn,
  withServingIdentityKey,
} = require('./lib/serving-identity-key');

const ROOT = path.join(__dirname, '..', '..');
const PROJECTS_DIR = path.join(ROOT, 'data', 'metadata', 'projects');
const EXCLUSIONS_FILE = path.join(ROOT, 'data', 'metadata', 'pipeline_collection_exclusions.v1.json');
const FACT_MATCHES_PATH = path.join(ROOT, 'data', 'warehouse', 'fact_matches.csv');
const TMP_DIR = path.join(ROOT, 'tmp');
const REPORTS_DIR = path.join(TMP_DIR, 'reports');
const PLAYER_METADATA_PATH = path.join(ROOT, 'scripts', 'player_metadata.json');
const SOOP_MAPPINGS_PATH = path.join(ROOT, 'data', 'metadata', 'soop_channel_mappings.v1.json');
const SOOP_REVIEW_DECISIONS_PATH = path.join(ROOT, 'data', 'metadata', 'soop_manual_review_decisions.v1.json');
const DEBUG_PAYLOAD_PATH = path.join(TMP_DIR, 'supabase_prod_sync_payload_preview.json');
const HISTORY_QUALITY_REPORT_PATH = path.join(REPORTS_DIR, 'prod_sync_history_quality_latest.json');
const STABLE_CSV_ROW_COUNT_CACHE = new Map();
const STABLE_CSV_LATEST_DATE_CACHE = new Map();

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

function inferGenderFromEntityId(value) {
  const match = String(value || '').trim().match(/^eloboard:(male|female)(:mix)?:\d+$/i);
  return match ? String(match[1] || '').toLowerCase() : '';
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
  if (wrId) {
    return { soop_id: null, broadcast_url: null };
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

function pickFirstDefined(row, keys) {
  if (!row || typeof row !== 'object' || !Array.isArray(keys)) return '';
  for (const key of keys) {
    if (!key) continue;
    const value = row[key];
    if (value !== undefined && value !== null && String(value).length > 0) {
      return value;
    }
  }
  return '';
}

function getStableCsvRowCount(sourceFile) {
  const name = String(sourceFile || '').trim();
  if (!name) return 0;
  if (STABLE_CSV_ROW_COUNT_CACHE.has(name)) {
    return STABLE_CSV_ROW_COUNT_CACHE.get(name);
  }
  const filePath = sourceCsvPath(name);
  const count = filePath ? readCsv(filePath).length : 0;
  STABLE_CSV_ROW_COUNT_CACHE.set(name, count);
  return count;
}

function getStableCsvLatestDateValue(sourceFile) {
  const name = String(sourceFile || '').trim();
  if (!name) return 0;
  if (STABLE_CSV_LATEST_DATE_CACHE.has(name)) {
    return STABLE_CSV_LATEST_DATE_CACHE.get(name);
  }

  const filePath = sourceCsvPath(name);
  const rows = filePath ? readCsv(filePath) : [];
  let latest = 0;
  for (const row of rows) {
    const value = pickFirstDefined(row, [
      'date',
      '\uB0A0\uC9DC',
      'Ã«â€šÂ Ã¬Â§Å“',
      'ÃƒÂ«Ã¢â‚¬Å¡Ã‚Â ÃƒÂ¬Ã‚Â§Ã…â€œ',
    ]);
    const match = String(value || '').trim().match(/^(\d{4})-(\d{2})-(\d{2})$/);
    if (!match) continue;
    const dateValue = Number(`${match[1]}${match[2]}${match[3]}`);
    if (Number.isFinite(dateValue) && dateValue > latest) latest = dateValue;
  }

  STABLE_CSV_LATEST_DATE_CACHE.set(name, latest);
  return latest;
}

function hasMeaningfulHistory(history) {
  return (
    Array.isArray(history) &&
    history.some((item) =>
      Boolean(
        String(item && item.opponent_name ? item.opponent_name : '').trim() ||
          String(item && item.match_date ? item.match_date : '').trim() ||
          String(item && item.map_name ? item.map_name : '').trim()
      )
    )
  );
}

function summarizeHistoryQuality(history) {
  const rows = Array.isArray(history) ? history : [];
  const opponentFilled = rows.filter((item) => String(item && item.opponent_name ? item.opponent_name : '').trim().length > 0).length;
  const dateFilled = rows.filter((item) => String(item && item.match_date ? item.match_date : '').trim().length > 0).length;
  const mapFilled = rows.filter((item) => String(item && item.map_name ? item.map_name : '').trim().length > 0).length;
  const meaningfulRows = rows.filter((item) =>
    Boolean(
      String(item && item.opponent_name ? item.opponent_name : '').trim() ||
        String(item && item.match_date ? item.match_date : '').trim() ||
        String(item && item.map_name ? item.map_name : '').trim()
    )
  ).length;
  const total = rows.length;
  return {
    total_rows: total,
    opponent_name_filled: opponentFilled,
    opponent_name_fill_rate: total ? Number((opponentFilled / total).toFixed(4)) : 0,
    match_date_filled: dateFilled,
    map_name_filled: mapFilled,
    meaningful_rows: meaningfulRows,
    meaningful_rate: total ? Number((meaningfulRows / total).toFixed(4)) : 0,
  };
}

function maxMatchHistoryDate(rows = []) {
  let latest = '';
  for (const row of Array.isArray(rows) ? rows : []) {
    const history = Array.isArray(row && row.match_history) ? row.match_history : [];
    for (const item of history) {
      const date = String(item && item.match_date ? item.match_date : '').trim();
      if (/^\d{4}-\d{2}-\d{2}$/.test(date) && date > latest) latest = date;
    }
  }
  return latest;
}

function assertNoProductionFreshnessRegression(prodRows = [], incomingRows = []) {
  const currentMax = maxMatchHistoryDate(prodRows);
  const incomingMax = maxMatchHistoryDate(incomingRows);
  if (!currentMax || !incomingMax || incomingMax >= currentMax) {
    return { ok: true, currentMax, incomingMax };
  }

  throw new Error(
    `Refusing production sync because incoming match_history is older than current production. current_max=${currentMax}, incoming_max=${incomingMax}.`
  );
}

function shouldReplaceHistoryWithStable(stableHistory, currentHistory) {
  if (!hasMeaningfulHistory(stableHistory)) {
    return { ok: false, reason: 'stable_history_not_meaningful' };
  }
  if (!Array.isArray(currentHistory) || currentHistory.length === 0) {
    return { ok: true, reason: 'no_current_history' };
  }

  const stable = summarizeHistoryQuality(stableHistory);
  const current = summarizeHistoryQuality(currentHistory);

  if (current.opponent_name_filled > 0 && stable.opponent_name_filled === 0) {
    return { ok: false, reason: 'stable_missing_opponent_names' };
  }
  if (current.meaningful_rows > 0 && stable.meaningful_rows === 0) {
    return { ok: false, reason: 'stable_missing_meaningful_rows' };
  }
  if (
    current.opponent_name_fill_rate >= 0.7 &&
    stable.opponent_name_fill_rate + 0.2 < current.opponent_name_fill_rate
  ) {
    return { ok: false, reason: 'stable_opponent_fill_rate_regressed' };
  }
  if (current.meaningful_rate >= 0.9 && stable.meaningful_rate + 0.05 < current.meaningful_rate) {
    return { ok: false, reason: 'stable_meaningful_rate_regressed' };
  }

  return { ok: true, reason: 'stable_history_preferred' };
}

function writeHistoryQualityReport(payload) {
  try {
    fs.mkdirSync(REPORTS_DIR, { recursive: true });
    fs.writeFileSync(HISTORY_QUALITY_REPORT_PATH, JSON.stringify(payload, null, 2), 'utf8');
  } catch {}
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

async function upsertPlayersChunkAdaptive(rows, onConflict = 'name') {
  if (!Array.isArray(rows) || rows.length === 0) return;

  const { error } = await supabase.from('players').upsert(rows, { onConflict });
  if (!error) return;

  if (!isStatementTimeout(error) || rows.length <= MIN_UPSERT_CHUNK_SIZE) {
    throw new Error(`Error upserting to players: ${JSON.stringify(error)}`);
  }

  const mid = Math.ceil(rows.length / 2);
  const left = rows.slice(0, mid);
  const right = rows.slice(mid);
  console.warn(`[retry] players upsert timeout on chunk=${rows.length}; splitting into ${left.length}+${right.length}`);
  await upsertPlayersChunkAdaptive(left, onConflict);
  await upsertPlayersChunkAdaptive(right, onConflict);
}

function parseMatchHistoryFromStableCsv(sourceFile) {
  const filePath = sourceCsvPath(sourceFile);
  if (!filePath) return null;
  const rows = readCsv(filePath);
  if (!rows.length) return [];
  return rows.map((row) => {
    const result = String(
      pickFirstDefined(row, [
        'result',
        '\uACBD\uAE30\uACB0\uACFC(\uC2B9/\uD328)',
        'ê²½ê¸°ê²°ê³¼(ìŠ¹/íŒ¨)',
        'ÃªÂ²Â½ÃªÂ¸Â°ÃªÂ²Â°ÃªÂ³Â¼(Ã¬Å Â¹/Ã­Å’Â¨)',
      ])
    ).trim();
    return {
      match_date: pickFirstDefined(row, [
        'date',
        '\uB0A0\uC9DC',
        'ë‚ ì§œ',
        'Ã«â€šÂ Ã¬Â§Å“',
      ]) || null,
      opponent_name: normalizeName(
        pickFirstDefined(row, [
          'opponent_name',
          '\uC0C1\uB300\uBA85',
          'ìƒëŒ€ëª…',
          'Ã¬Æ’ÂÃ«Å’â‚¬Ã«Âªâ€¦',
        ])
      ),
      opponent_race: normalizeRaceCode(
        pickFirstDefined(row, [
          'opponent_race',
          '\uC0C1\uB300\uC885\uC871',
          'ìƒëŒ€ì¢…ì¡±',
          'Ã¬Æ’ÂÃ«Å’â‚¬Ã¬Â¢â€¦Ã¬Â¡Â±',
        ])
      ),
      map_name: pickFirstDefined(row, [
        'map',
        '\uB9F5',
        'ë§µ',
        'Ã«Â§Âµ',
      ]) || null,
      is_win:
        result === '\uC2B9' ||
        result === 'ìŠ¹' ||
        result === 'Ã¬Å Â¹' ||
        result.toLowerCase() === 'win',
      result_text: result || null,
      note:
        pickFirstDefined(row, [
          'note',
          '\uBA54\uBAA8',
          'ë©”ëª¨',
          'Ã«Â©â€Ã«ÂªÂ¨',
        ]) || null,
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

  const scoreCandidate = (candidate) => {
    let score = 0;
    if (candidate.gender === gender) score += 10_000_000_000;
    if (candidate.isMix === wantsMix) score += 1_000_000_000;
    score += getStableCsvLatestDateValue(candidate.fileName) * 1000;
    score += Math.min(getStableCsvRowCount(candidate.fileName), 1000);
    if (/_상세전적\.csv$/i.test(candidate.fileName)) score += 5;
    return score;
  };

  const ranked = [...candidates].sort((a, b) => {
    const diff = scoreCandidate(b) - scoreCandidate(a);
    if (diff !== 0) return diff;
    return String(a.fileName).localeCompare(String(b.fileName));
  });

  return ranked[0] ? ranked[0].fileName : null;
}

function attachServingStatsAlias(map, aliasKey, entry) {
  const key = String(aliasKey || '').trim();
  if (!key || map.has(key)) return;
  map.set(key, entry);
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

function buildServingStatsByIdentity(players = []) {
  const rows = readCsv(FACT_MATCHES_PATH);
  const byIdentity = new Map();
  const sourceFileByIdentity = new Map();
  const stableCsvIndex = buildStableCsvIndex();
  const playerByIdentity = new Map();
  for (const player of Array.isArray(players) ? players : []) {
    const identityKey = buildSyncIdentityKey(player);
    if (identityKey && identityKey !== 'unknown' && !playerByIdentity.has(identityKey)) {
      playerByIdentity.set(identityKey, player);
    }
  }
  const playerIdentityByName = new Map(
    (Array.isArray(players) ? players : [])
      .map((player) => [normalizeName(player && player.name ? player.name : ''), buildSyncIdentityKey(player)])
      .filter(([name, identityKey]) => name && identityKey && identityKey !== 'unknown')
  );

  for (const row of rows) {
    const playerName = normalizeName(row.player_name);
    const identityKey =
      buildSyncIdentityKey({ eloboard_id: row.player_entity_id, gender: inferGenderFromEntityId(row.player_entity_id) }) ||
      playerIdentityByName.get(playerName) ||
      (playerName ? `name:${playerName}` : '');
    if (!identityKey || identityKey === 'unknown') continue;
    if (!sourceFileByIdentity.has(identityKey)) {
      sourceFileByIdentity.set(identityKey, String(row.source_file || '').trim());
    }
    const entry = byIdentity.get(identityKey) || {
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
    byIdentity.set(identityKey, entry);
    attachServingStatsAlias(byIdentity, playerName, entry);
    attachServingStatsAlias(byIdentity, playerName ? `name:${playerName}` : '', entry);
  }

  for (const [identityKey, entry] of byIdentity.entries()) {
    const stableSourceFile =
      findStableCsvSourceFile(playerByIdentity.get(identityKey), stableCsvIndex) ||
      sourceFileByIdentity.get(identityKey);
    const stableHistory = parseMatchHistoryFromStableCsv(stableSourceFile);
    const replacementDecision = shouldReplaceHistoryWithStable(stableHistory, entry.history);
    if (replacementDecision.ok) {
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
    const identityKey = buildSyncIdentityKey(player);
    if (!identityKey || identityKey === 'unknown' || byIdentity.has(identityKey)) continue;
    const stableSourceFile = findStableCsvSourceFile(player, stableCsvIndex);
    const stableHistory = parseMatchHistoryFromStableCsv(stableSourceFile);
    if (!hasMeaningfulHistory(stableHistory)) continue;
    const wins = stableHistory.filter((item) => item.is_win).length;
    const entry = {
      wins,
      losses: stableHistory.length - wins,
      history: stableHistory,
    };
    byIdentity.set(identityKey, entry);
    attachServingStatsAlias(byIdentity, name, entry);
    attachServingStatsAlias(byIdentity, name ? `name:${name}` : '', entry);
  }

  return byIdentity;
}

const buildServingStatsByName = buildServingStatsByIdentity;

function buildSyncIdentityKey(row) {
  const servingIdentityKey = String(row && row.serving_identity_key ? row.serving_identity_key : '').trim();
  if (servingIdentityKey) return servingIdentityKey;

  const entityId = String(row && row.eloboard_id ? row.eloboard_id : '').trim();
  const wrId = extractWrId(entityId);
  const gender = String(row && row.gender ? row.gender : '').trim().toLowerCase() || inferGenderFromEntityId(entityId);
  if (wrId && gender) return `${gender}:${wrId}`;
  if (wrId) return `wr:${wrId}`;
  if (entityId) return `entity:${entityId.toLowerCase()}`;
  const name = normalizeLookupName(row && row.name ? row.name : '');
  return name ? `name:${name}` : 'unknown';
}

function findProductionIdentityConflicts(prodRows = [], sanitizedRows = []) {
  const prodByName = new Map();
  for (const row of Array.isArray(prodRows) ? prodRows : []) {
    const name = normalizeName(row && row.name ? row.name : '');
    if (!name) continue;
    prodByName.set(name, row);
  }

  const conflicts = [];
  for (const row of Array.isArray(sanitizedRows) ? sanitizedRows : []) {
    const name = normalizeName(row && row.name ? row.name : '');
    if (!name) continue;
    const existing = prodByName.get(name);
    if (!existing) continue;
    const incomingIdentity = buildSyncIdentityKey(row);
    const existingIdentity = buildSyncIdentityKey(existing);
    if (incomingIdentity !== existingIdentity) {
      conflicts.push({
        name,
        existing_identity: existingIdentity,
        incoming_identity: incomingIdentity,
        existing_eloboard_id: String(existing && existing.eloboard_id ? existing.eloboard_id : ''),
        incoming_eloboard_id: String(row && row.eloboard_id ? row.eloboard_id : ''),
      });
    }
  }

  return conflicts;
}

function selectStaleProductionRows(prodRows = [], sanitizedRows = []) {
  const validNames = new Set(
    (Array.isArray(sanitizedRows) ? sanitizedRows : [])
      .map((row) => normalizeName(row && row.name ? row.name : ''))
      .filter(Boolean)
  );
  const validIdentities = new Set(
    (Array.isArray(sanitizedRows) ? sanitizedRows : [])
      .map((row) => buildSyncIdentityKey(row))
      .filter((identityKey) => identityKey && identityKey !== 'unknown' && !identityKey.startsWith('name:'))
  );

  return (Array.isArray(prodRows) ? prodRows : []).filter((row) => {
    const identityKey = buildSyncIdentityKey(row);
    if (identityKey && identityKey !== 'unknown' && !identityKey.startsWith('name:')) {
      return !validIdentities.has(identityKey);
    }

    const name = normalizeName(row && row.name ? row.name : '');
    return !validNames.has(name);
  });
}

function findUnsafeStaleDeleteRows(rows = []) {
  return (Array.isArray(rows) ? rows : []).filter((row) => {
    const name = normalizeName(row && row.name ? row.name : '');
    const identityKey = buildSyncIdentityKey(row);
    return !name || !identityKey || identityKey === 'unknown' || identityKey.startsWith('name:');
  });
}

function buildServingPayload(playerOrName, servingStatsByIdentity, existingPlayer) {
  const identityKey =
    playerOrName && typeof playerOrName === 'object' ? buildSyncIdentityKey(playerOrName) : '';
  const hasDurableIdentity = identityKey && identityKey !== 'unknown' && !identityKey.startsWith('name:');
  const nameKey =
    playerOrName && typeof playerOrName === 'object'
      ? normalizeName(playerOrName && playerOrName.name ? playerOrName.name : '')
      : String(playerOrName || '').trim();
  const stats =
    (playerOrName && typeof playerOrName === 'object'
      ? servingStatsByIdentity.get(identityKey) ||
        (!hasDurableIdentity && nameKey ? servingStatsByIdentity.get(nameKey) : null) ||
        (!hasDurableIdentity && nameKey ? servingStatsByIdentity.get(`name:${nameKey}`) : null)
      : servingStatsByIdentity.get(nameKey) || (nameKey ? servingStatsByIdentity.get(`name:${nameKey}`) : null)) ||
    null;
  if (stats) {
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
  }

  if (existingPlayer) {
    return {
      detailed_stats: existingPlayer.detailed_stats || null,
      match_history: Array.isArray(existingPlayer.match_history) ? existingPlayer.match_history : null,
      total_wins: Number(existingPlayer.total_wins || 0),
      total_losses: Number(existingPlayer.total_losses || 0),
      win_rate: Number(existingPlayer.win_rate || 0),
      last_synced_at: existingPlayer.last_synced_at || null,
    };
  }

  return {
    detailed_stats: null,
    match_history: null,
    total_wins: 0,
    total_losses: 0,
    win_rate: 0,
    last_synced_at: null,
  };
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
  const canWriteServingIdentityKey = await tableHasColumn(
    supabase,
    'players',
    'serving_identity_key'
  );

  const { data: prodData, error: prodErr } = await supabase
    .from('players')
    .select('name,eloboard_id,gender,serving_identity_key,detailed_stats,match_history,total_wins,total_losses,win_rate,last_synced_at');
  if (prodErr) throw prodErr;
  const currentProdByName = new Map(
    (prodData || [])
      .map((row) => [String(row && row.name ? row.name : '').trim(), row])
      .filter(([name]) => name.length > 0)
  );

  // 1) Fetch source from staging
  const { data: stagingData, error: stagingErr } = await supabase
    .from('players_staging')
    .select('eloboard_id,name,tier,race,university,gender,photo_url,last_match_at,last_changed_at,check_priority,check_interval_days');
  if (stagingErr) throw stagingErr;
  const servingStatsByIdentity = buildServingStatsByIdentity(stagingData || []);

  const sanitized = (stagingData || [])
    .map((row) => ({
      ...resolveSoopServingMetadata(row, soopLookup),
      ...buildServingPayload(
        row,
        servingStatsByIdentity,
        currentProdByName.get(String(row.name || '').trim()) || null
      ),
      eloboard_id: row.eloboard_id,
      name: String(row.name || '').trim(),
      tier: row.tier || '誘몄젙',
      race: row.race || null,
      university: row.university || '',
      gender: row.gender || null,
      photo_url: row.photo_url || null,
      last_match_at: row.last_match_at || null,
      last_changed_at: row.last_changed_at || null,
      check_priority: row.check_priority || null,
      check_interval_days: Number.isFinite(Number(row.check_interval_days)) ? Number(row.check_interval_days) : null,
    }))
    .map((row) => withServingIdentityKey(row, canWriteServingIdentityKey))
    .filter((row) => row.name.length > 0);

  const historyQuality = {
    generated_at: new Date().toISOString(),
    players_total: sanitized.length,
    players_with_match_history: sanitized.filter((row) => Array.isArray(row.match_history) && row.match_history.length > 0).length,
    players_with_blank_opponent_rows: 0,
    total_match_history_rows: 0,
    opponent_name_filled_rows: 0,
    opponent_name_fill_rate: 0,
    degraded_players: [],
  };

  for (const row of sanitized) {
    const quality = summarizeHistoryQuality(row.match_history);
    historyQuality.total_match_history_rows += quality.total_rows;
    historyQuality.opponent_name_filled_rows += quality.opponent_name_filled;
    if (quality.total_rows > 0 && quality.opponent_name_filled < quality.total_rows) {
      historyQuality.players_with_blank_opponent_rows += 1;
      if (historyQuality.degraded_players.length < 25) {
        historyQuality.degraded_players.push({
          name: row.name,
          eloboard_id: row.eloboard_id || null,
          total_rows: quality.total_rows,
          opponent_name_filled: quality.opponent_name_filled,
          opponent_name_fill_rate: quality.opponent_name_fill_rate,
        });
      }
    }
  }
  historyQuality.opponent_name_fill_rate = historyQuality.total_match_history_rows
    ? Number((historyQuality.opponent_name_filled_rows / historyQuality.total_match_history_rows).toFixed(4))
    : 0;
  writeHistoryQualityReport(historyQuality);

  if (
    historyQuality.total_match_history_rows > 0 &&
    historyQuality.opponent_name_fill_rate < 0.8
  ) {
    throw new Error(
      `Refusing production sync because match_history opponent_name fill rate is too low (${historyQuality.opponent_name_fill_rate}).`
    );
  }
  assertNoProductionFreshnessRegression(prodData || [], sanitized);

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

  const identityConflicts = findProductionIdentityConflicts(prodData || [], sanitized);
  if (identityConflicts.length > 0) {
    const preview = identityConflicts
      .slice(0, 5)
      .map((row) => `${row.name} [prod=${row.existing_identity}, incoming=${row.incoming_identity}]`)
      .join('; ');
    throw new Error(
      `Production identity conflicts detected before players sync (${identityConflicts.length}). ${preview}`
    );
  }

  console.log(`[+] Fetched ${sanitized.length} valid records from players_staging`);
  console.log(
    `[=] match_history opponent_name fill rate: ${historyQuality.opponent_name_filled_rows}/${historyQuality.total_match_history_rows} (${historyQuality.opponent_name_fill_rate})`
  );
  console.log(`[=] serving_identity_key write enabled: ${canWriteServingIdentityKey}`);

  // 2) Use the current production snapshot for stale-delete phase
  // 3) Upsert all staging rows by unique serving key when available. Do not pass id.
  const chunkSize = resolveInitialChunkSize();
  const upsertConflictTarget = canWriteServingIdentityKey ? 'serving_identity_key' : 'name';
  for (let i = 0; i < sanitized.length; i += chunkSize) {
    const chunk = sanitized.slice(i, i + chunkSize);
    await upsertPlayersChunkAdaptive(chunk, upsertConflictTarget);
  }
  console.log(`[+] Upserted ${sanitized.length} records to players`);

  // 4) Delete stale rows not present in staging snapshot
  const toDelete = selectStaleProductionRows(prodData || [], sanitized);
  const unsafeStaleDeletes = findUnsafeStaleDeleteRows(toDelete);
  if (unsafeStaleDeletes.length > 0) {
    const preview = unsafeStaleDeletes
      .slice(0, 5)
      .map((row) => `${String(row && row.name ? row.name : '').trim() || '<missing-name>'} [identity=${buildSyncIdentityKey(row)}]`)
      .join('; ');
    throw new Error(
      `Refusing stale delete because ${unsafeStaleDeletes.length} candidate rows do not have a durable sync identity. ${preview}`
    );
  }
  console.log(`[!] Found ${toDelete.length} stale players not in local pipeline.`);

  if (toDelete.length > 0) {
    const deleteKeys = toDelete
      .map((row) => canWriteServingIdentityKey ? buildSyncIdentityKey(row) : String(row.name || '').trim())
      .filter(Boolean);
    const deleteColumn = canWriteServingIdentityKey ? 'serving_identity_key' : 'name';
    for (let i = 0; i < deleteKeys.length; i += chunkSize) {
      const chunk = deleteKeys.slice(i, i + chunkSize);
      const { error: delErr } = await supabase.from('players').delete().in(deleteColumn, chunk);
      if (delErr) {
        throw new Error(`Failed to delete stale players: ${delErr.message}`);
      }
    }
    console.log(`[-] Successfully removed ${deleteKeys.length} stale records.`);
  }

  // 5) Final verification
  const { count: finalCount, error: countErr } = await supabase
    .from('players')
    .select('*', { count: 'exact', head: true });
  if (countErr) throw countErr;

  console.log(`\n=== 蹂?諛섏쁺 由ы룷??(Production Report) ===`);
  console.log(`[=] Production 'players' 理쒖쥌 Row ?? ${finalCount}`);
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
  buildSyncIdentityKey,
  buildServingStatsByIdentity,
  buildServingStatsByName: buildServingStatsByIdentity,
  findProductionIdentityConflicts,
  selectStaleProductionRows,
  findUnsafeStaleDeleteRows,
  buildServingPayload,
  buildSoopLookup,
  buildServingStatsByName,
  assertNoProductionFreshnessRegression,
  maxMatchHistoryDate,
  parseCsvLine,
  parseMatchHistoryFromStableCsv,
  resolveSoopServingMetadata,
  readCsv,
  summarizeHistoryQuality,
  shouldReplaceHistoryWithStable,
  sourceCsvPath,
};

