const axios = require('axios');
const cheerio = require('cheerio');
const { createClient } = require('@supabase/supabase-js');
require('dotenv').config({ path: '.env.local' });

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const supabase = createClient(supabaseUrl, supabaseAnonKey);

const RACE_MAP = { 'P': 'P', 'T': 'T', 'Z': 'Z', 'R': 'R' };

async function finalMasterSync() {
    console.log('🚀 Starting Master Sync (SSUSTAR + ELOBOARD)...');

    try {
        // 1. Fetch SSUSTAR Data
        console.log('Step 1: Extracting SSUSTAR active rosters...');
        const battleRes = await axios.get('https://ssustar.iwinv.net/university_battle.php');
        const rosterMatch = battleRes.data.match(/const collegeRosters = (\{.*?\});/s);
        const rosters = rosterMatch ? JSON.parse(rosterMatch[1]) : {};

        const vsRes = await axios.get('https://ssustar.iwinv.net/1vs1.php');
        const activePool = {}; // Name -> { race }
        const pRegex = /\{"key":"(.*?)"\}/g;
        let pMatch;
        while ((pMatch = pRegex.exec(vsRes.data)) !== null) {
            const parts = pMatch[1].split('_');
            if (parts.length >= 2) {
                activePool[parts[0]] = { race: RACE_MAP[parts[1].toUpperCase()] || 'R' };
            }
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
                        tier: '미정'
                    });
                }
            });
        }
        console.log(`Initial Pool: ${playersToSync.length} players from SSUSTAR.`);

        // 3. Fetch Tiers from Eloboard
        console.log('Step 3: Fetching tiers from Eloboard...');
        const playerTiers = {};
        for (let page = 1; page <= 35; page++) {
            if (page % 10 === 0) console.log(`Scanning Eloboard Page ${page}...`);
            try {
                const res = await axios.post('https://eloboard.com/univ/bbs/p_month_list.php', `sear_=s9&b_id=eloboard&page=${page}`, {
                    headers: { 'User-Agent': 'Mozilla/5.0', 'Content-Type': 'application/x-www-form-urlencoded' },
                    timeout: 8000
                });
                const $ = cheerio.load(`<table>${res.data}</table>`);
                $('tr').each((i, row) => {
                    const nameCell = $(row).find('td.list-subject').text().trim();
                    const tierCell = $(row).find('td').eq(6).text().trim(); 
                    if (nameCell && tierCell) {
                        playerTiers[nameCell] = tierCell;
                    }
                });
            } catch (e) {
                console.warn(`Page ${page} error: ${e.message}`);
            }
        }

        // 4. Final Data Assembly
        const finalData = playersToSync.map(p => {
            let tier = playerTiers[p.name] || '미정';
            // Adjust tier names to match our internal system
            if (tier === '9') tier = '베이비'; // Logic: 9 tier on Eloboard might be Baby in this context
            if (tier === '갓') tier = 'GOD';
            if (tier === '킹') tier = 'KING';
            if (tier === '잭') tier = 'JACK';
            
            return {
                ...p,
                tier,
                last_synced_at: new Date().toISOString()
            };
        });

        // 5. Update Database
        console.log('Step 5: Updating Supabase...');
        // We don't wipe everything, but we update these specific players
        const { error: upsertError } = await supabase.from('players').upsert(finalData, { onConflict: 'name' });
        if (upsertError) throw upsertError;

        console.log('✅ COMPLETE! University rosters synched with SSUSTAR/ELOBOARD.');

    } catch (err) {
        console.error('❌ SYNC ERROR:', err.message);
    }
}

finalMasterSync();
