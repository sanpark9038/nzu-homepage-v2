const fs = require('fs');
const path = require('path');
const { createClient } = require('@supabase/supabase-js');
require('dotenv').config({ path: path.join(__dirname, '..', '..', '.env.local') });
const {
  loadMergedRosterAdminState,
  shouldApplyManualAffiliationOverride,
  shouldApplyManualRaceOverride,
  shouldApplyManualTierOverride,
} = require('./lib/roster-admin-store');
const {
  tableHasColumn,
  withServingIdentityKey,
} = require('./lib/serving-identity-key');

const ROOT = path.join(__dirname, '..', '..');
const PROJECTS_DIR = path.join(ROOT, 'data', 'metadata', 'projects');
const PLAYER_METADATA_PATH = path.join(ROOT, 'scripts', 'player_metadata.json');
const SOOP_MAPPINGS_PATH = path.join(ROOT, 'data', 'metadata', 'soop_channel_mappings.v1.json');
const SOOP_REVIEW_DECISIONS_PATH = path.join(ROOT, 'data', 'metadata', 'soop_manual_review_decisions.v1.json');
const SOOP_SNAPSHOT_PATH = path.join(ROOT, 'data', 'metadata', 'soop_live_snapshot.generated.v1.json');
const SNAPSHOT_FRESH_MS = 15 * 60 * 1000;

function createSupabaseClient() {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || '';
  const supabaseServiceRoleKey =
    process.env.SUPABASE_SERVICE_ROLE_KEY ||
    process.env.SUPABASE_SERVICE_KEY ||
    '';

  if (!supabaseUrl || !supabaseServiceRoleKey) {
    throw new Error(
      'Supabase staging sync requires NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY (or SUPABASE_SERVICE_KEY).'
    );
  }

  return createClient(supabaseUrl, supabaseServiceRoleKey);
}

function normalizeName(value) {
  return String(value || '').trim();
}

function normalizeLookupName(value) {
  return normalizeName(value).toLowerCase();
}

function readJson(filePath, fallback = null) {
  if (!fs.existsSync(filePath)) return fallback;
  return JSON.parse(fs.readFileSync(filePath, 'utf8').replace(/^\uFEFF/, ''));
}

function extractWrId(value) {
  const raw = String(value || '').trim();
  if (!raw) return null;
  if (/^\d+$/.test(raw)) return raw;
  const match = raw.match(/(\d+)$/);
  return match ? match[1] : null;
}

function loadSoopSnapshot() {
  const doc = readJson(SOOP_SNAPSHOT_PATH, null);
  if (!doc || typeof doc !== 'object') {
    return { isFresh: false, channels: {} };
  }
  const updatedAt = String(doc.updated_at || '').trim();
  const updatedTime = Date.parse(updatedAt);
  const isFresh =
    Number.isFinite(updatedTime) &&
    Date.now() - updatedTime >= 0 &&
    Date.now() - updatedTime <= SNAPSHOT_FRESH_MS;
  return {
    isFresh,
    channels: doc && typeof doc.channels === 'object' ? doc.channels : {},
  };
}

function buildSoopLookup() {
  const rows = readJson(PLAYER_METADATA_PATH, []);
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

  for (const row of Array.isArray(rows) ? rows : []) {
    const wrId = Number(row && row.wr_id);
    const gender = String(row && row.gender ? row.gender : '').trim().toLowerCase();
    const soopUserId = String(row && row.soop_user_id ? row.soop_user_id : '').trim();
    const name = normalizeLookupName(row && row.name ? row.name : '');
    if (!Number.isFinite(wrId) || !gender || !soopUserId) continue;
    const payload = { soop_id: soopUserId };
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

  const mappingsDoc = readJson(SOOP_MAPPINGS_PATH, {});
  const aliases = mappingsDoc && typeof mappingsDoc.aliases === 'object' ? mappingsDoc.aliases : {};
  const mappings = Array.isArray(mappingsDoc && mappingsDoc.mappings) ? mappingsDoc.mappings : [];
  for (const row of mappings) {
    const soopUserId = String(row && row.soop_user_id ? row.soop_user_id : '').trim();
    const rawName = normalizeName(row && row.name ? row.name : '');
    if (!rawName || !soopUserId) continue;
    const payload = { soop_id: soopUserId };
    registerNamePayload(rawName, payload);
    registerNamePayload(aliases[rawName] || '', payload);
  }

  const reviewDoc = readJson(SOOP_REVIEW_DECISIONS_PATH, {});
  const decisions = Array.isArray(reviewDoc && reviewDoc.decisions) ? reviewDoc.decisions : [];
  for (const row of decisions) {
    const decision = String(row && row.decision ? row.decision : '').trim().toLowerCase();
    const soopUserId = String(row && row.soop_user_id ? row.soop_user_id : '').trim();
    if (decision !== 'include' || !soopUserId) continue;
    const payload = { soop_id: soopUserId };
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

function resolveLiveState(player, soopLookup, snapshot) {
  if (!snapshot.isFresh) return false;
  const entityId = String(player && player.entity_id ? player.entity_id : '').trim();
  const wrId = extractWrId(entityId);
  const gender = String(player && player.gender ? player.gender : '').trim().toLowerCase();
  const name = normalizeLookupName(player && player.name ? player.name : '');

  const metadata =
    (wrId && gender ? soopLookup.lookup.get(`${wrId}:${gender}`) : null) ||
    (wrId && isMixEntityId(entityId) ? soopLookup.byWrId.get(String(wrId)) : null) ||
    (wrId ? null : name && gender ? soopLookup.byNameGender.get(`${name}:${gender}`) : null) ||
    (wrId ? null : name ? soopLookup.byName.get(name) : null) ||
    null;

  if (!metadata || !metadata.soop_id) return false;
  const channel = snapshot.channels[metadata.soop_id];
  return Boolean(channel && channel.isLive === true);
}

function uniqueUpsertKeyCount(players) {
  return new Set(
    players
      .map((player) => normalizeName(player && player.name ? player.name : ''))
      .filter(Boolean)
  ).size;
}

function buildStableIdentityKey(player) {
  const entityId = String(player && (player.eloboard_id || player.entity_id) ? (player.eloboard_id || player.entity_id) : '').trim();
  const wrId = extractWrId(entityId);
  const gender = String(player && player.gender ? player.gender : '').trim().toLowerCase();
  if (wrId && gender) return `${gender}:${wrId}`;
  if (wrId) return `wr:${wrId}`;
  if (entityId) return `entity:${entityId.toLowerCase()}`;
  const name = normalizeLookupName(player && player.name ? player.name : '');
  return name ? `name:${name}` : 'unknown';
}

function findHarmfulNameIdentityCollisions(players) {
  const byName = new Map();

  for (const player of Array.isArray(players) ? players : []) {
    const name = normalizeName(player && player.name ? player.name : '');
    if (!name) continue;
    const identityKey = buildStableIdentityKey(player);
    const bucket = byName.get(name) || new Map();
    if (!bucket.has(identityKey)) {
      bucket.set(identityKey, {
        identity_key: identityKey,
        eloboard_id: String(player && (player.eloboard_id || player.entity_id) ? (player.eloboard_id || player.entity_id) : ''),
        gender: String(player && player.gender ? player.gender : '').trim().toLowerCase() || null,
      });
    }
    byName.set(name, bucket);
  }

  return [...byName.entries()]
    .filter(([, identities]) => identities.size > 1)
    .map(([name, identities]) => ({
      name,
      identities: [...identities.values()],
    }));
}

function findUnsafeUpsertIdentityRows(players) {
  return (Array.isArray(players) ? players : []).filter((player) => {
    const name = normalizeName(player && player.name ? player.name : '');
    const identityKey = buildStableIdentityKey(player);
    return !name || !identityKey || identityKey === 'unknown' || identityKey.startsWith('name:');
  });
}

function isMixEntityId(entityId) {
  return /:mix:\d+$/i.test(String(entityId || '').trim());
}

function toTime(value) {
  const ms = Date.parse(String(value || ''));
  return Number.isFinite(ms) ? ms : -1;
}

function choosePreferredNameRow(current, candidate) {
  const currentMix = isMixEntityId(current && current.eloboard_id);
  const candidateMix = isMixEntityId(candidate && candidate.eloboard_id);
  if (currentMix !== candidateMix) return candidateMix ? candidate : current;

  const currentChecked = toTime(current && current.last_checked_at);
  const candidateChecked = toTime(candidate && candidate.last_checked_at);
  if (currentChecked !== candidateChecked) return candidateChecked > currentChecked ? candidate : current;

  const currentMatch = toTime(current && current.last_match_at);
  const candidateMatch = toTime(candidate && candidate.last_match_at);
  if (currentMatch !== candidateMatch) return candidateMatch > currentMatch ? candidate : current;

  return current;
}

function dedupePlayersByName(players) {
  const byName = new Map();
  const collisions = [];
  for (const player of players) {
    const name = normalizeName(player && player.name ? player.name : '');
    if (!name) continue;
    if (!byName.has(name)) {
      byName.set(name, player);
      continue;
    }
    const previous = byName.get(name);
    const chosen = choosePreferredNameRow(previous, player);
    const dropped = chosen === player ? previous : player;
    byName.set(name, chosen);
    collisions.push({
      name,
      kept_eloboard_id: String(chosen && chosen.eloboard_id ? chosen.eloboard_id : ''),
      dropped_eloboard_id: String(dropped && dropped.eloboard_id ? dropped.eloboard_id : ''),
    });
  }
  return {
    players: [...byName.values()],
    collisions,
  };
}

async function main() {
  console.log('--- Supabase Staging Sync Started ---');
  const supabase = createSupabaseClient();
  const canWriteServingIdentityKey = await tableHasColumn(
    supabase,
    'players_staging',
    'serving_identity_key'
  );
  const soopLookup = buildSoopLookup();
  const soopSnapshot = loadSoopSnapshot();
  
  // 1. Load Exclusions and Overrides
  const rosterAdminState = await loadMergedRosterAdminState();
  const exclusionRules = (rosterAdminState.exclusions || []).map((p) => {
    const wrId = Number(p && p.wr_id);
    const name = String(p && p.name ? p.name : '').trim().toLowerCase();
    const entityId = String(p && p.entity_id ? p.entity_id : '').trim();
    return {
      entity_id: entityId || null,
      wr_id: Number.isFinite(wrId) && wrId > 0 ? wrId : null,
      name: name || null,
    };
  });
  
  const overridesMap = new Map();
  const overridesByName = new Map();
  (rosterAdminState.overrides || []).forEach(o => {
    const entityId = String(o && o.entity_id ? o.entity_id : '').trim();
    const name = normalizeName(o && o.name ? o.name : '');
    if (entityId) overridesMap.set(entityId, o);
    if (name && !overridesByName.has(name)) overridesByName.set(name, o);
  });

  // 2. Load all project JSONs
  let allPlayers = [];
  const dirs = fs.readdirSync(PROJECTS_DIR, { withFileTypes: true }).filter(d => d.isDirectory());
  
  for (const d of dirs) {
    const filePath = path.join(PROJECTS_DIR, d.name, `players.${d.name}.v1.json`);
    if (fs.existsSync(filePath)) {
      const data = readJson(filePath, { roster: [] });
      const roster = Array.isArray(data.roster) ? data.roster : [];
      roster.forEach(p => {
        // Enforce the manual locks strictly
        const override = overridesMap.get(String(p.entity_id)) || overridesByName.get(normalizeName(p.name));
        if (override) {
          if (shouldApplyManualTierOverride(override)) p.tier = override.tier;
          if (shouldApplyManualRaceOverride(override)) p.race = override.race;
          if (shouldApplyManualAffiliationOverride(override)) p.team_code = override.team_code;
          if (override.name) p.name = override.name;
        }

        const rMode = String(p.race || '').trim().toUpperCase();
        const shortRace = rMode.startsWith('T') ? 'T' : rMode.startsWith('Z') ? 'Z' : rMode.startsWith('P') ? 'P' : 'T';
        const isLive = resolveLiveState(p, soopLookup, soopSnapshot);

        // Map to DB schema
        allPlayers.push({
          eloboard_id: p.entity_id,
          name: p.name || '',
          tier: p.tier || '미정',
          race: shortRace,
          university: p.team_name || '',
          gender: p.gender || null,
          photo_url: p.photo_url || null,
          last_checked_at: p.last_checked_at || null,
          last_match_at: p.last_match_at || null,
          last_changed_at: p.last_changed_at || null,
          check_priority: p.check_priority || null,
          check_interval_days: Number.isFinite(Number(p.check_interval_days)) ? Number(p.check_interval_days) : null,
          created_at: new Date().toISOString(),
          is_live: isLive,
        });
      });
    }
  }

  // 3. Filter excluded players
  const shouldExclude = (player) => {
    const entityId = String(player.eloboard_id || '').trim();
    const wrId = Number(entityId.split(':').pop());
    const name = String(player.name || '').trim().toLowerCase();
    return exclusionRules.some((rule) => {
      if (!rule) return false;
      if (rule.entity_id) return entityId === rule.entity_id;
      if (rule.wr_id && rule.name) return wrId === rule.wr_id && name === rule.name;
      if (rule.wr_id) return wrId === rule.wr_id;
      if (rule.name) return name === rule.name;
      return false;
    });
  };
  const validPlayers = allPlayers.filter(p => !shouldExclude(p));
  const excludedCount = allPlayers.length - validPlayers.length;
  const harmfulNameCollisions = findHarmfulNameIdentityCollisions(validPlayers);
  if (harmfulNameCollisions.length > 0) {
    const preview = harmfulNameCollisions
      .slice(0, 5)
      .map((row) => `${row.name} [${row.identities.map((identity) => identity.identity_key).join(', ')}]`)
      .join('; ');
    throw new Error(
      `Harmful name-based identity collisions detected before staging sync (${harmfulNameCollisions.length}). ${preview}`
    );
  }
  const deduped = dedupePlayersByName(validPlayers);
  const playersForUpsert = deduped.players;
  const expectedUpsertRows = uniqueUpsertKeyCount(playersForUpsert);
  const unsafeUpsertIdentityRows = findUnsafeUpsertIdentityRows(playersForUpsert);
  if (unsafeUpsertIdentityRows.length > 0) {
    const preview = unsafeUpsertIdentityRows
      .slice(0, 5)
      .map((row) => `${String(row && row.name ? row.name : '').trim() || '<missing-name>'} [identity=${buildStableIdentityKey(row)}]`)
      .join('; ');
    throw new Error(
      `Refusing staging sync because ${unsafeUpsertIdentityRows.length} rows do not have a durable upsert identity. ${preview}`
    );
  }

  // 4. Truncate staging table safely
  console.log('Truncating players_staging...');
  await supabase.from('players_staging').delete().neq('name', 'INVALID_NAME_FOR_TRUNCATE');

  // Insert to staging
  console.log(`Inserting ${playersForUpsert.length} players to players_staging...`);
  console.log(`[=] serving_identity_key write enabled: ${canWriteServingIdentityKey}`);
  const chunkSize = 100;
  for (let i = 0; i < playersForUpsert.length; i += chunkSize) {
    const chunk = playersForUpsert
      .slice(i, i + chunkSize)
      .map((row) => withServingIdentityKey(row, canWriteServingIdentityKey));
    const { error } = await supabase
      .from('players_staging')
      .upsert(chunk, { onConflict: canWriteServingIdentityKey ? 'serving_identity_key' : 'name' });
    if (error) {
       console.error('Error inserting chunk:', error);
    }
  }

  // Verification Queries
  const { count: stagingTotal } = await supabase.from('players_staging').select('*', { count: 'exact', head: true });
  const { count: faCount } = await supabase.from('players_staging').select('*', { count: 'exact', head: true }).or('university.eq.무소속,university.eq.연합팀');
  const { data: jiking } = await supabase
    .from('players_staging')
    .select('name, tier, race, check_priority, check_interval_days')
    .eq('eloboard_id', 'eloboard:female:704')
    .single();
  const excludedEntityIds = exclusionRules
    .map((rule) => String(rule && rule.entity_id ? rule.entity_id : '').trim())
    .filter(Boolean);
  const { data: excludedCheck } = excludedEntityIds.length
    ? await supabase.from('players_staging').select('name, eloboard_id').in('eloboard_id', excludedEntityIds)
    : { data: [] };

  console.log('\n=== 검증 리포트 (Verification Report) ===');
  console.log(`[+] 전체 적재 대상: ${allPlayers.length}명`);
  console.log(`[-] 제외 필터 적용: ${excludedCount}명 제외됨 (사유: Exclusion List)`);
  console.log(`[=] 이름 충돌 정규화: ${deduped.collisions.length}건`);
  console.log(`[=] Staging 적재 완료: ${stagingTotal}명\n`);
  console.log(`[=] 예상 Upsert Key 수(name 기준): ${expectedUpsertRows}명`);
  console.log(`[=] SOOP snapshot fresh: ${soopSnapshot.isFresh}`);
  console.log(`[=] staging live rows prepared: ${playersForUpsert.filter((row) => row.is_live === true).length}`);

  if (Number(stagingTotal || 0) < Math.floor(expectedUpsertRows * 0.8)) {
    throw new Error(
      `Staging visible row count is unexpectedly low. expected_unique_names=${expectedUpsertRows}, actual=${Number(stagingTotal || 0)}`
    );
  }
  
  console.log(`📌 FA(무소속) 병력: ${faCount}명`);
  console.log(`📌 exclusion entity_id 실제 DB 검출 수: ${excludedCheck ? excludedCheck.length : 0}명 (0이어야 정상)`);
  
  console.log(`\n📌 찌킹(entity_id eloboard:female:704) 샘플 검증:`);
  if (jiking) {
     console.log(` - 이름: ${jiking.name}`);
     console.log(` - 티어: ${jiking.tier} (정상: 4)`);
     console.log(` - 종족: ${jiking.race} (정상: Zerg)`);
     console.log(` - 점검우선순위: ${jiking.check_priority ?? 'null'}`);
     console.log(` - 점검간격일: ${jiking.check_interval_days ?? 'null'}`);
  } else {
     console.log(` - 검색 실패!`);
  }
}

if (require.main === module) {
  main().catch((error) => {
    console.error(error instanceof Error ? error.stack || error.message : String(error));
    process.exit(1);
  });
}

module.exports = {
  buildStableIdentityKey,
  choosePreferredNameRow,
  dedupePlayersByName,
  findHarmfulNameIdentityCollisions,
  findUnsafeUpsertIdentityRows,
  resolveLiveState,
};
