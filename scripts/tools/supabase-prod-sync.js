const path = require('path');
const { createClient } = require('@supabase/supabase-js');
require('dotenv').config({ path: path.join(__dirname, '..', '..', '.env.local') });

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
);

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
