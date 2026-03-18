const axios = require('axios');
const { createClient } = require('@supabase/supabase-js');
require('dotenv').config({ path: '.env.local' });

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const supabase = createClient(supabaseUrl, supabaseAnonKey);

async function syncFromSsustarBattle() {
    console.log('🚀 Starting Direct SSUSTAR Data Harvesting (BJ Names)...');

    try {
        const res = await axios.get('https://ssustar.iwinv.net/university_battle.php');
        
        // 1. Extract playerInfo
        const infoMatch = res.data.match(/const playerInfo = (\{.*?\});/s);
        const playerInfo = infoMatch ? JSON.parse(infoMatch[1]) : {};
        
        console.log(`Found ${Object.keys(playerInfo).length} players in playerInfo.`);

        const finalPlayers = [];

        // 2. Process everyone in playerInfo - KEEP BJ NAMES
        for (const key in playerInfo) {
            const info = playerInfo[key];
            const name = info.name; // Keep the BJ name from SSUSTAR

            let univ = info.college || '무소속';
            
            let tier = info.tier || '미정';
            if (tier === '9') tier = '베이비';
            if (tier === '갓') tier = 'GOD';
            if (tier === '킹') tier = 'KING';
            if (tier === '잭') tier = 'JACK';
            if (tier === '조커') tier = 'JOKER';

            let race = info.race || 'R';
            if (race === 'U') race = 'R';

            finalPlayers.push({
                name: name,
                race: race,
                tier: tier,
                university: univ,
                last_synced_at: new Date().toISOString()
            });
        }

        console.log(`Step 3: Updating Supabase with ${finalPlayers.length} players...`);
        const chunkSize = 100;
        for (let i = 0; i < finalPlayers.length; i += chunkSize) {
            const chunk = finalPlayers.slice(i, i + chunkSize);
            const { error: upsertError } = await supabase.from('players').upsert(chunk, { onConflict: 'name' });
            if (upsertError) console.error(`Batch ${i} error:`, upsertError.message);
        }

        console.log('✅ SSUSTAR Internal Data Sync Complete (BJ Names Restored)!');

    } catch (err) {
        console.error('❌ FATAL ERROR:', err.message);
    }
}

syncFromSsustarBattle();
