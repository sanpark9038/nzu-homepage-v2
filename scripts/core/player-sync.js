const axios = require('axios');
const path = require('path');
// Use absolute-like relative path from root
const { supabase, BJ_NAME_MAPPING } = require('../utils/db');

const PLAYERS_TO_REMOVE = new Set(['카권']);

async function playerSync() {
    console.log('🚀 Starting Robust Master SSUSTAR Sync...');

    try {
        // 1. Fetch 1vs1 Races
        const vsRes = await axios.get('https://ssustar.iwinv.net/1vs1.php');
        const raceMap = {}; 
        const pRegex = /\{"key":"(.*?)"\}/g;
        let match;
        while ((match = pRegex.exec(vsRes.data)) !== null) {
            const parts = match[1].split('_');
            if (parts.length >= 2) {
                const name = parts[0];
                const race = parts[1].toUpperCase();
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

        const manualRaces = {
            '트슈': 'P', '구라미스': 'P', '미동미동': 'P', 
            '액션구드론': 'Z', '샤이니': 'T', '져지현': 'Z'
        };

        const manualTiers = { '져지현': 'JOKER' };

        for (const key in playerInfo) {
            const info = playerInfo[key];
            const originalName = info.name;
            const name = BJ_NAME_MAPPING[originalName] || originalName;

            if (PLAYERS_TO_REMOVE.has(name) || PLAYERS_TO_REMOVE.has(originalName)) continue;

            let race = manualRaces[name] || manualRaces[originalName] || raceMap[name] || raceMap[originalName] || info.race;
            if (!['P', 'T', 'Z'].includes(race)) race = 'T';

            let tier = manualTiers[name] || manualTiers[originalName] || info.tier || '미정';
            const tierMap = { '9': '베이비', '갓': 'GOD', '킹': 'KING', '잭': 'JACK', '조커': 'JOKER', '스페이드': '스페이드' };
            tier = tierMap[tier] || tier;

            finalPlayers.push({
                name: name,
                race: race,
                tier: tier,
                university: info.college || '무소속',
                last_synced_at: new Date().toISOString()
            });
        }

        console.log(`Step 3: Upserting ${finalPlayers.length} players to Supabase...`);
        const { error: upsertError } = await supabase.from('players').upsert(finalPlayers, { onConflict: 'name' });
        
        if (upsertError) {
            console.error(`Batch error, trying individual...`, upsertError.message);
            for (const p of finalPlayers) {
                await supabase.from('players').upsert(p, { onConflict: 'name' });
            }
        }

        console.log('✅ Robust Sync Complete!');
    } catch (err) {
        console.error('❌ FATAL ERROR:', err.message);
    }
}

playerSync();
