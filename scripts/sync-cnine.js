const axios = require('axios');
const cheerio = require('cheerio');
const { createClient } = require('@supabase/supabase-js');
require('dotenv').config({ path: '.env.local' });

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const supabase = createClient(supabaseUrl, supabaseAnonKey);

const RACE_MAP = { 'P': 'P', 'T': 'T', 'Z': 'Z', 'R': 'R', 'A': 'R' };

async function syncCnine() {
    console.log('🚀 Starting CNine-Reference Sync...');

    try {
        // 1. Fetch All Active Players Meta from CNine API
        console.log('Step 1: Fetching master metadata from CNine API...');
        const cnineApiRes = await axios.get('https://www.cnine.kr/api/v2/p/starcraft/soop/player?size=2000');
        const cnineMeta = cnineApiRes.data.data;
        const nameToMeta = {};
        cnineMeta.forEach(p => {
            nameToMeta[p.name] = {
                race: RACE_MAP[p.race?.toUpperCase()] || 'R',
                tier: p.tier || 'N/A',
                activated: p.activated,
                enabled: p.enabled
            };
        });

        // 2. Fetch Universities from CNine Entry Page
        console.log('Step 2: Fetching university list from CNine Entry...');
        const entryUrl = 'https://www.cnine.kr/starcraft/entry';
        const { data: entryHtml } = await axios.get(entryUrl);
        const $ = cheerio.load(entryHtml);
        const universities = [];
        $('select[name="univ_name"] option').each((i, el) => {
            const val = $(el).val();
            if (val) universities.push(val);
        });
        console.log(`Found ${universities.length} universities on CNine.`);

        // 3. For each University, fetch their lineup
        console.log('Step 3: Fetching lineups for each university...');
        const finalPlayers = [];
        const processedNames = new Set();

        for (const univ of universities) {
            console.log(`Fetching lineup for: ${univ}...`);
            const univRes = await axios.get(`${entryUrl}?univ_name=${encodeURIComponent(univ)}`);
            const $univ = cheerio.load(univRes.data);
            
            // On CNine entry page, players are usually in the cards or tables
            // Let's look for player names. They are often in a specific class.
            // Based on previous analysis or visual check, they are in .player-name or similar
            // I'll search for any text that matches a player in our metadata
            
            const pageText = $univ.text();
            // We'll iterate over our nameToMeta and see who is on this page
            for (const name in nameToMeta) {
                if (pageText.includes(name)) {
                    if (processedNames.has(name)) continue;
                    
                    const meta = nameToMeta[name];
                    if (!meta.activated || !meta.enabled) continue;

                    finalPlayers.push({
                        name: name,
                        race: meta.race,
                        tier: meta.tier,
                        university: univ,
                        last_synced_at: new Date().toISOString()
                    });
                    processedNames.add(name);
                }
            }
        }

        console.log(`Final Sync List: ${finalPlayers.length} active players matched.`);

        // 4. Update Supabase
        console.log('Step 4: Updating Supabase...');
        
        // Wipe current players to ensure only "currently active in a university" players remain
        const { error: delError } = await supabase.from('players').delete().neq('id', '00000000-0000-0000-0000-000000000000');
        if (delError) console.warn('Wipe warning:', delError.message);

        const chunkSize = 100;
        for (let i = 0; i < finalPlayers.length; i += chunkSize) {
            const chunk = finalPlayers.slice(i, i + chunkSize);
            const { error: upsertError } = await supabase.from('players').upsert(chunk, { onConflict: 'name' });
            if (upsertError) console.error(`Upsert Error in batch ${i/chunkSize}:`, upsertError.message);
        }

        console.log('✅ CNine-Reference Sync Complete!');

    } catch (err) {
        console.error('❌ Sync Failed:', err.message);
    }
}

syncCnine();
