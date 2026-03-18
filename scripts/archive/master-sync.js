const axios = require('axios');
const { createClient } = require('@supabase/supabase-js');
require('dotenv').config({ path: '.env.local' });

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const supabase = createClient(supabaseUrl, supabaseAnonKey);

const BJ_NAME_MAPPING = {
    '김성민': '구라미스',
    '박현재': '기뉴다',
    '김재현': '샤이니',
    '박준영': '미동미동',
    '김동민': '액션구드론',
    '우규민': '초난강',
    'Judge현': '져지현'
};

const PLAYERS_TO_REMOVE = new Set(['카권']);

async function masterSync() {
    console.log('🚀 Starting Robust Master SSUSTAR Sync...');

    try {
        // 1. Fetch 1vs1 Races (The gold standard)
        const vsRes = await axios.get('https://ssustar.iwinv.net/1vs1.php');
        const raceMap = {}; 
        const pRegex = /\{"key":"(.*?)"\}/g;
        let match;
        while ((match = pRegex.exec(vsRes.data)) !== null) {
            const parts = match[1].split('_');
            if (parts.length >= 2) {
                const name = parts[0];
                const race = parts[1].toUpperCase();
                // Store only valid races
                if (['P', 'T', 'Z'].includes(race)) {
                    raceMap[name] = race;
                }
            }
        }

        // 2. Fetch Tiers/Colleges
        const battleRes = await axios.get('https://ssustar.iwinv.net/university_battle.php');
        const infoMatch = battleRes.data.match(/const playerInfo = (\{.*?\});/s);
        const playerInfo = infoMatch ? JSON.parse(infoMatch[1]) : {};
        
        const finalPlayers = [];

        // Manual corrections based on User Request
        const manualRaces = {
            '트슈': 'P',
            '구라미스': 'P',
            '미동미동': 'P',
            '액션구드론': 'Z',
            '샤이니': 'T', // 김재현
            '져지현': 'Z'
        };

        const manualTiers = {
            '져지현': 'JOKER'
        };

        for (const key in playerInfo) {
            const info = playerInfo[key];
            const originalName = info.name;
            const name = BJ_NAME_MAPPING[originalName] || originalName;

            if (PLAYERS_TO_REMOVE.has(name) || PLAYERS_TO_REMOVE.has(originalName)) {
                console.log(`Skipping excluded player: ${originalName}`);
                continue;
            }

            // Priority: Manual > 1vs1 > Original Info
            let race = manualRaces[name] || manualRaces[originalName] || raceMap[name] || raceMap[originalName] || info.race;
            
            // Final validation: DB only allows P, T, Z
            if (!['P', 'T', 'Z'].includes(race)) {
                // If still invalid, default to T to prevent batch failure
                if (!['P', 'T', 'Z'].includes(race)) race = 'T';
            }

            let tier = manualTiers[name] || manualTiers[originalName] || info.tier || '미정';
            if (tier === '9') tier = '베이비';
            if (tier === '갓') tier = 'GOD';
            if (tier === '킹') tier = 'KING';
            if (tier === '잭') tier = 'JACK';
            if (tier === '조커') tier = 'JOKER';
            if (tier === '스페이드') tier = '스페이드';

            finalPlayers.push({
                name: name,
                race: race,
                tier: tier,
                university: info.college || '무소속',
                last_synced_at: new Date().toISOString()
            });
        }

        console.log(`Step 3: Upserting ${finalPlayers.length} players to Supabase...`);
        // Use smaller chunks and handle errors per player if needed, but chunking is fine if race is valid
        const chunkSize = 50; 
        for (let i = 0; i < finalPlayers.length; i += chunkSize) {
            const chunk = finalPlayers.slice(i, i + chunkSize);
            const { error: upsertError } = await supabase.from('players').upsert(chunk, { onConflict: 'name' });
            if (upsertError) {
                console.error(`Batch ${i} error:`, upsertError.message);
                // If chunk fails, try one by one in this chunk
                for (const p of chunk) {
                    const { error: singleError } = await supabase.from('players').upsert(p, { onConflict: 'name' });
                    if (singleError) console.error(`Failed individual player ${p.name}:`, singleError.message);
                }
            }
        }

        console.log('✅ Robust Sync Complete!');

    } catch (err) {
        console.error('❌ FATAL ERROR:', err.message);
    }
}

masterSync();
