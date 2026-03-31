const fs = require('fs');
const path = require('path');
const { createClient } = require('@supabase/supabase-js');
require('dotenv').config({ path: path.join(__dirname, '..', '..', '.env.local') });

const ROOT = path.join(__dirname, '..', '..');
const PROJECTS_DIR = path.join(ROOT, 'data', 'metadata', 'projects');
const EXCLUSIONS_FILE = path.join(ROOT, 'data', 'metadata', 'pipeline_collection_exclusions.v1.json');
const OVERRIDES_FILE = path.join(ROOT, 'data', 'metadata', 'roster_manual_overrides.v1.json');

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
);

function normalizeName(value) {
  return String(value || '').trim();
}

function uniqueUpsertKeyCount(players) {
  return new Set(
    players
      .map((player) => normalizeName(player && player.name ? player.name : ''))
      .filter(Boolean)
  ).size;
}

async function main() {
  console.log('--- Supabase Staging Sync Started ---');
  
  // 1. Load Exclusions and Overrides
  const exclusionsData = JSON.parse(fs.readFileSync(EXCLUSIONS_FILE, 'utf8').replace(/^\uFEFF/, ''));
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
  
  const overridesData = fs.existsSync(OVERRIDES_FILE) ? JSON.parse(fs.readFileSync(OVERRIDES_FILE, 'utf8').replace(/^\uFEFF/, '')) : { overrides: [] };
  const overridesMap = new Map();
  const overridesByName = new Map();
  (overridesData.overrides || []).forEach(o => {
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
      const data = JSON.parse(fs.readFileSync(filePath, 'utf8').replace(/^\uFEFF/, ''));
      const roster = Array.isArray(data.roster) ? data.roster : [];
      roster.forEach(p => {
        // Enforce the manual locks strictly
        const override = overridesMap.get(String(p.entity_id)) || overridesByName.get(normalizeName(p.name));
        if (override) {
          if (override.tier) p.tier = override.tier;
          if (override.race) p.race = override.race;
          if (override.team_code) p.team_code = override.team_code;
          if (override.name) p.name = override.name;
        }

        const rMode = String(p.race || '').trim().toUpperCase();
        const shortRace = rMode.startsWith('T') ? 'T' : rMode.startsWith('Z') ? 'Z' : rMode.startsWith('P') ? 'P' : 'T';

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
          is_live: false,
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
  const expectedUpsertRows = uniqueUpsertKeyCount(validPlayers);

  // 4. Truncate staging table safely
  console.log('Truncating players_staging...');
  await supabase.from('players_staging').delete().neq('name', 'INVALID_NAME_FOR_TRUNCATE');

  // Insert to staging
  console.log(`Inserting ${validPlayers.length} players to players_staging...`);
  const chunkSize = 100;
  for (let i = 0; i < validPlayers.length; i += chunkSize) {
    const chunk = validPlayers.slice(i, i + chunkSize);
    const { error } = await supabase.from('players_staging').upsert(chunk, { onConflict: 'name' });
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
  const { data: excludedCheck } = await supabase.from('players_staging').select('name, eloboard_id').in('name', ['김수환', '김민교', '박한별', '이상호', '농떼르만', '엘사', '옥수수']);

  console.log('\n=== 검증 리포트 (Verification Report) ===');
  console.log(`[+] 전체 적재 대상: ${allPlayers.length}명`);
  console.log(`[-] 제외 필터 적용: ${excludedCount}명 제외됨 (사유: Exclusion List)`);
  console.log(`[=] Staging 적재 완료: ${stagingTotal}명\n`);
  console.log(`[=] 예상 Upsert Key 수(name 기준): ${expectedUpsertRows}명`);

  if (Number(stagingTotal || 0) < Math.floor(expectedUpsertRows * 0.8)) {
    throw new Error(
      `Staging visible row count is unexpectedly low. expected_unique_names=${expectedUpsertRows}, actual=${Number(stagingTotal || 0)}`
    );
  }
  
  console.log(`📌 FA(무소속) 병력: ${faCount}명`);
  console.log(`📌 제외 타겟 7명 실제 DB 검출 수: ${excludedCheck ? excludedCheck.length : 0}명 (0이어야 정상)`);
  
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

main().catch((error) => {
  console.error(error instanceof Error ? error.stack || error.message : String(error));
  process.exit(1);
});
