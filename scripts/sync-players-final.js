const axios = require('axios');
const cheerio = require('cheerio');
const { createClient } = require('@supabase/supabase-js');
require('dotenv').config({ path: '.env.local' });

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const supabase = createClient(supabaseUrl, supabaseAnonKey);

const RACE_MAP = { 'P': 'P', 'T': 'T', 'Z': 'Z', 'R': 'R' };

async function finalMasterSync() {
    console.log('🚀 Starting Final Master Sync (SSUSTAR Driven)...');

    try {
        // 1. Fetch SSUSTAR Data
        console.log('Step 1: Extracting SSUSTAR active rosters & pool...');
        const battleRes = await axios.get('https://ssustar.iwinv.net/university_battle.php');
        const rosterMatch = battleRes.data.match(/const collegeRosters = (\{.*?\});/s);
        const rosters = rosterMatch ? JSON.parse(rosterMatch[1]) : {};

        const vsRes = await axios.get('https://ssustar.iwinv.net/1vs1.php');
        const activePool = []; // Name -> { race }
        const pRegex = /\{"key":"(.*?)"\}/g;
        let pMatch;
        while ((pMatch = pRegex.exec(vsRes.data)) !== null) {
            const parts = pMatch[1].split('_');
            activePool[parts[0]] = { race: RACE_MAP[parts[1].toUpperCase()] || 'R' };
        }

        // 2. Identify University Assignments
        const playersToSync = [];
        for (const [univName, members] of Object.entries(rosters)) {
            members.forEach(name => {
                if (activePool[name]) {
                    playersToSync.push({
                        name,
                        university: univName,
                        race: activePool[name].race,
                        tier: 'N/A' // To be filled from Eloboard
                    });
                }
            });
        }
        console.log(`Initial Pool: ${playersToSync.length} players assigned to ${Object.keys(rosters).length} universities.`);

        // 3. Fetch Tiers from Eloboard (Monthly List is the fastest bulk source)
        console.log('Step 3: Fetching tiers from Eloboard Monthly Ranking...');
        const playerTiers = {};
        for (let page = 1; page <= 50; page++) {
            if (page % 10 === 0) console.log(`Scanning Eloboard tiers (Page ${page})...`);
            try {
                const res = await axios.post('https://eloboard.com/univ/bbs/p_month_list.php', `sear_=s9&b_id=eloboard&page=${page}`, {
                    headers: { 'User-Agent': 'Mozilla/5.0', 'Content-Type': 'application/x-www-form-urlencoded' },
                    timeout: 5000
                });
                const $ = cheerio.load(`<table>${res.data}</table>`);
                $('tr').each((i, row) => {
                    const nameCell = $(row).find('td.list-subject').text().trim();
                    const tierCell = $(row).find('td').eq(6).text().trim(); // Usually the 7th cell
                    if (nameCell && tierCell) {
                        playerTiers[nameCell] = tierCell;
                    }
                });
            } catch (e) {
                console.warn(`Failed to scan page ${page}: ${e.message}`);
            }
        }

        // 4. Final Data Assembly
        const finalData = playersToSync.map(p => ({
            ...p,
            tier: playerTiers[p.name] || 'N/A',
            last_synced_at: new Date().toISOString()
        }));

        console.log(`Step 4: Finalizing ${finalData.length} records...`);

        // 5. Database Wipe and Upsert
        console.log('Step 5: Wiping and Updating Supabase...');
        const { error: delError } = await supabase.from('players').delete().neq('id', '00000000-0000-0000-0000-000000000000');
        if (delError) console.warn('Delete error:', delError.message);

        const chunkSize = 100;
        for (let i = 0; i < finalData.length; i += chunkSize) {
            const chunk = finalData.slice(i, i + chunkSize);
            const { error: upsertError } = await supabase.from('players').upsert(chunk, { onConflict: 'name' });
            if (upsertError) console.error(`Upsert error at ${i}:`, upsertError.message);
        }

        console.log('✅ COMPLETE! The sanctuary is updated with SSUSTAR-grade filtered data.');

    } catch (err) {
        console.error('❌ FATAL SYNC ERROR:', err.message);
    }
}

finalMasterSync();
