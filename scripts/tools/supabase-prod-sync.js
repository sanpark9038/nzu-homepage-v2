const fs = require('fs');
const path = require('path');
const { createClient } = require('@supabase/supabase-js');
require('dotenv').config({ path: path.join(__dirname, '..', '..', '.env.local') });

const ROOT = path.join(__dirname, '..', '..');
const PROJECTS_DIR = path.join(ROOT, 'data', 'metadata', 'projects');
const EXCLUSIONS_FILE = path.join(ROOT, 'data', 'metadata', 'pipeline_collection_exclusions.v1.json');

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
);

function normalizeName(value) {
  return String(value || '').trim();
}

function readJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, 'utf8').replace(/^\uFEFF/, ''));
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

  // 1) Fetch source from staging
  const { data: stagingData, error: stagingErr } = await supabase
    .from('players_staging')
    .select('eloboard_id,name,tier,race,university,gender,photo_url,is_live,last_checked_at,last_match_at,last_changed_at,check_priority,check_interval_days');
  if (stagingErr) throw stagingErr;

  const sanitized = (stagingData || [])
    .map((row) => ({
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
  const chunkSize = 100;
  for (let i = 0; i < sanitized.length; i += chunkSize) {
    const chunk = sanitized.slice(i, i + chunkSize);
    const { error } = await supabase.from('players').upsert(chunk, { onConflict: 'name' });
    if (error) {
      throw new Error(`Error upserting to players: ${JSON.stringify(error)}`);
    }
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

main().catch((error) => {
  console.error(error instanceof Error ? error.stack || error.message : String(error));
  process.exit(1);
});
