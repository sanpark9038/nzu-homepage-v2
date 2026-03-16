const axios = require('axios');
const cheerio = require('cheerio');
const { createClient } = require('@supabase/supabase-js');
require('dotenv').config({ path: '.env.local' });

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const supabase = createClient(supabaseUrl, supabaseAnonKey);

const RACE_MAP = { 'P': 'P', 'T': 'T', 'Z': 'Z', 'R': 'R', 'A': 'R' };

async function masterSync() {
    console.log('🚀 Starting Master Sync (Inspired by SSUSTAR & CNine)...');

    try {
        // 1. Fetch Universities from Eloboard
        console.log('Step 1: Fetching current universities...');
        const univMap = {};
        const univRes = await axios.post('https://eloboard.com/univ/bbs/month_list.php', 'sear_=s9&b_id=eloboard', {
            headers: { 'User-Agent': 'Mozilla/5.0' }
        });
        const $univ = cheerio.load(`<table><tbody>${univRes.data}</tbody></table>`);
        $univ('td.list-subject a').each((i, el) => {
            const name = $univ(el).clone().children('img').remove().end().text().trim();
            const id = $univ(el).attr('href').match(/wr_id=(\d+)/)?.[1];
            if (id && name) univMap[id] = name;
        });
        console.log(`Found ${Object.keys(univMap).length} active universities.`);

        // 2. Fetch Player Assignments (Active Players only) from Eloboard p_month_list
        // This is how SSUSTAR/CNine determine who is "active" in the current scene.
        console.log('Step 2: Fetching player university assignments from Season Ranking...');
        const playerToUnivMap = {};
        for (let page = 1; page <= 50; page++) { // Fetch up to 50 pages to get all active players
            const res = await axios.post('https://eloboard.com/univ/bbs/p_month_list.php', `sear_=s9&b_id=eloboard&page=${page}`, {
                headers: { 'User-Agent': 'Mozilla/5.0', 'Content-Type': 'application/x-www-form-urlencoded' }
            });
            const $p = cheerio.load(`<table><tbody>${res.data}</tbody></table>`);
            const rows = $p('tr');
            if (rows.length === 0 || res.data.length < 100) break;

            rows.each((i, row) => {
                const univId = $p(row).find('td:nth-child(2) a').attr('href')?.match(/wr_id=(\d+)/)?.[1];
                const playerWrId = $p(row).find('td.list-subject a').attr('href')?.match(/wr_id=(\d+)/)?.[1];
                if (playerWrId && univId) {
                    playerToUnivMap[playerWrId] = univId;
                }
            });
        }
        console.log(`Mapped ${Object.keys(playerToUnivMap).length} active players to universities.`);

        // 3. Fetch Player Info from CNine (Source for Names & Tiers)
        console.log('Step 3: Fetching BJ mapping and metadata from CNine...');
        const cnineRes = await axios.get('https://www.cnine.kr/api/v2/p/starcraft/soop/player?size=2000');
        const cninePlayers = cnineRes.data.data;
        
        const wrIdToCnineInfo = {};
        cninePlayers.forEach(p => {
            if (p.eloboardKey) {
                const keys = p.eloboardKey.split(',');
                keys.forEach(key => {
                    const match = key.match(/_(\d+)_/);
                    if (match) {
                        const wr_id = match[1];
                        wrIdToCnineInfo[wr_id] = {
                            name: p.name,
                            race: RACE_MAP[p.race?.toUpperCase()] || 'R',
                            tier: p.tier || 'N/A',
                            activated: p.activated,
                            enabled: p.enabled
                        };
                    }
                });
            }
        });

        // 4. Combine and Filter (The "Master" logic)
        console.log('Step 4: Merging and filtering for active players...');
        const playersToUpsert = [];
        const processedWrIds = new Set();
        const validRaces = ['P', 'T', 'Z']; // DB constraint

        // We iterate over the Eloboard Monthly Ranking (Active Scene)
        for (const wr_id in playerToUnivMap) {
            const univId = playerToUnivMap[wr_id];
            const univName = univMap[univId] || '무소속';
            
            // Get mapping info from CNine
            const cnine = wrIdToCnineInfo[wr_id];
            if (!cnine) continue; // If not in CNine, we skip (following CNine/SSUSTAR filtering)
            if (!cnine.activated || !cnine.enabled) continue; // Only truly active
            if (!validRaces.includes(cnine.race)) continue; // Skip Random/Other for now to avoid DB errors

            if (processedWrIds.has(wr_id)) continue;
            
            playersToUpsert.push({
                name: cnine.name,
                race: cnine.race,
                tier: cnine.tier,
                university: univName,
                last_synced_at: new Date().toISOString()
            });
            processedWrIds.add(wr_id);
        }

        console.log(`Final processed count: ${playersToUpsert.length} players.`);

        // 5. Cleanup and Sync
        if (playersToUpsert.length === 0) {
            console.log('⚠️ No players found to sync. Skipping cleanup to avoid accidental wipe.');
            return;
        }

        console.log('Step 5: Cleaning up and upserting to Supabase...');
        // We wipe current players and repopulate with the "Active-Only" list
        const { error: delError } = await supabase.from('players').delete().neq('id', '00000000-0000-0000-0000-000000000000');
        if (delError) console.warn('Delete warning:', delError.message);

        const chunkSize = 100;
        for (let i = 0; i < playersToUpsert.length; i += chunkSize) {
            const chunk = playersToUpsert.slice(i, i + chunkSize);
            const { error: upsertError } = await supabase.from('players').upsert(chunk, { onConflict: 'name' });
            if (upsertError) console.error(`Upsert Error in batch ${i/chunkSize}:`, upsertError.message);
        }

        console.log('✅ Master Sync Complete! Total players synced:', playersToUpsert.length);

    } catch (err) {
        console.error('❌ Master Sync Failed:', err.stack);
    }
}

masterSync();
