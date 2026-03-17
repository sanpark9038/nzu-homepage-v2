const axios = require('axios');
const cheerio = require('cheerio');
const qs = require('querystring');
const { createClient } = require('@supabase/supabase-js');
require('dotenv').config({ path: '.env.local' });

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
);

const HEADERS = {
    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
    'X-Requested-With': 'XMLHttpRequest',
    'Content-Type': 'application/x-www-form-urlencoded; charset=UTF-8'
};

async function syncPlayerRecentMatches(name, wrId, gender = 'female') {
    const subdomain = gender === 'male' ? 'men' : 'women';
    console.log(`\n🎯 Pinpoint Sync: [${name}] (ID: ${wrId}, Sub: ${subdomain})...`);
    
    try {
        const { data: html } = await axios.post(`https://eloboard.com/${subdomain}/bbs/view_list.php`, qs.stringify({
            p_name: name,
            last_id: 0,
            b_id: 'eloboard'
        }), { headers: HEADERS, timeout: 10000 });
        
        const $ = cheerio.load(html);
        const matches = [];
        const now = new Date();
        const yesterday = new Date(now.getTime() - (24 * 60 * 60 * 1000));
        const limitDate = yesterday.toISOString().split('T')[0];

        $('tr').each((i, el) => {
            const cells = $(el).find('td');
            if (cells.length >= 4) {
                const dateRaw = $(cells[0]).text().trim();
                const oppRaw = $(cells[1]).text().trim();
                const map = $(cells[2]).text().trim();
                const resultText = $(cells[3]).text().trim();
                const note = $(cells[5]) ? $(cells[5]).text().trim() : '';

                const dateMatch = dateRaw.match(/^\d{4}-\d{2}-\d{2}/);
                const matchDate = dateMatch ? dateMatch[0] : null;

                if (matchDate && matchDate >= limitDate) {
                    const oppMatch = oppRaw.match(/^(.*?)\((.*?)\)$/);
                    const opponentName = oppMatch ? oppMatch[1] : oppRaw;
                    const opponentRace = oppMatch ? oppMatch[2] : 'U';
                    const isWin = resultText.includes('+') || (!resultText.includes('패') && parseFloat(resultText) > 0);

                    matches.push({
                        player_name: name,
                        opponent_name: opponentName,
                        opponent_race: ['P','T','Z'].includes(opponentRace) ? opponentRace : 'U',
                        map,
                        is_win: isWin,
                        result_text: resultText,
                        match_date: matchDate,
                        note: note
                    });
                }
            }
        });

        if (matches.length === 0) {
            console.log(`- No matches found in last 24h.`);
            return 0;
        }

        console.log(`- Found ${matches.length} recent matches. Upserting...`);
        const { error } = await supabase.from('eloboard_matches').upsert(matches, {
            onConflict: 'player_name, opponent_name, match_date, map, result_text, note'
        });

        if (error) {
            console.error(`- Upsert Error: ${error.message}`);
            return 0;
        }

        console.log(`✅ Synced ${matches.length} matches for ${name}.`);
        return matches.length;

    } catch (e) {
        console.error(`❌ Failed to sync ${name}: ${e.message}`);
        return 0;
    }
}

async function runTest() {
    console.log('🚀 NZU Pinpoint Sync Prototype (Test Mode)');
    
    // Test with '조일장' (male, active) and '주서리' (female, active)
    const testPlayers = [
        { name: '조일장', eloboard_id: '13', gender: 'male' },
        { name: '주서리', eloboard_id: '566', gender: 'female' }
    ];

    console.log(`Testing with: ${testPlayers.map(p => p.name).join(', ')}`);
    
    let totalSynced = 0;
    for (const player of testPlayers) {
        totalSynced += await syncPlayerRecentMatches(player.name, player.eloboard_id, player.gender);
    }

    console.log(`\n🏁 Test finished. Total recent matches synced: ${totalSynced}`);
}

runTest();
