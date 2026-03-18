const axios = require('axios');
const cheerio = require('cheerio');
const { createClient } = require('@supabase/supabase-js');
require('dotenv').config({ path: '.env.local' });

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const supabase = createClient(supabaseUrl, supabaseAnonKey);

const RACE_MAP = { 'P': 'P', 'T': 'T', 'Z': 'Z', 'R': 'R' };
const NAME_MAPPING = {
  '구라미스': '김성민',
  // Add more mappings here if discovered
};

async function syncAllSsustar() {
    console.log('🚀 Starting Full SSUSTAR 1vs1 Sync...');

    try {
        // 1. Fetch SSUSTAR Data
        console.log('Step 1: Extracting SSUSTAR active rosters & pool...');
        const battleRes = await axios.get('https://ssustar.iwinv.net/university_battle.php');
        const rosterMatch = battleRes.data.match(/const collegeRosters = (\{.*?\});/s);
        const rosters = rosterMatch ? JSON.parse(rosterMatch[1]) : {};

        const vsRes = await axios.get('https://ssustar.iwinv.net/1vs1.php');
        const activePool = {}; // SSUSTAR_Name -> { race, originalKey }
        const pRegex = /\{"key":"(.*?)"\}/g;
        let pMatch;
        while ((pMatch = pRegex.exec(vsRes.data)) !== null) {
            const parts = pMatch[1].split('_');
            if (parts.length >= 2) {
                const sName = parts[0];
                const mappedName = NAME_MAPPING[sName] || sName;
                activePool[mappedName] = { 
                  race: RACE_MAP[parts[1].toUpperCase()] || 'R',
                  ssustarName: sName
                };
            }
        }

        // 2. Map University from Rosters
        const playerToUniv = {};
        for (const [univName, members] of Object.entries(rosters)) {
            members.forEach(name => {
                const mappedName = NAME_MAPPING[name] || name;
                playerToUniv[mappedName] = univName;
            });
        }

        // 3. Assemble all players from 1vs1 pool
        const allPlayers = Object.keys(activePool).map(name => ({
            name,
            race: activePool[name].race,
            university: playerToUniv[name] || '무소속',
            tier: '미정'
        }));

        console.log(`Total 1vs1 players identified: ${allPlayers.length}`);

        // 4. Fetch Tiers from Eloboard
        console.log('Step 4: Fetching tiers from Eloboard (Large scan)...');
        const playerTiers = {};
        for (let page = 1; page <= 50; page++) { // Scanning more pages to cover 700+ players
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

        // 5. Final Data assembly & adjustment
        const finalData = allPlayers.map(p => {
            let tier = playerTiers[p.name] || '미정';
            if (tier === '9') tier = '베이비';
            if (tier === '갓') tier = 'GOD';
            if (tier === '킹') tier = 'KING';
            if (tier === '잭') tier = 'JACK';
            
            return {
                ...p,
                last_synced_at: new Date().toISOString()
            };
        });

        // 6. Push to Supabase
        console.log('Step 6: Updating Supabase records...');
        const chunkSize = 100;
        for (let i = 0; i < finalData.length; i += chunkSize) {
            const chunk = finalData.slice(i, i + chunkSize);
            const { error: upsertError } = await supabase.from('players').upsert(chunk, { onConflict: 'name' });
            if (upsertError) console.error(`Batch ${i} error:`, upsertError.message);
        }

        console.log('✅ Sync Complete! Total players processed: ' + finalData.length);

    } catch (err) {
        console.error('❌ FATAL ERROR:', err.message);
    }
}

syncAllSsustar();
