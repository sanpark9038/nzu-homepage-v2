const axios = require('axios');
const cheerio = require('cheerio');
const qs = require('querystring');
const { createClient } = require('@supabase/supabase-js');
require('dotenv').config({ path: '.env.local' });

/**
 * 🚀 Pinpoint Sync (24h Incremental)
 * Strategic match scraper that targets individual players to ensure zero missing matches.
 * Uses the proven HTML table parsing for real-time accuracy.
 */

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
);

const HEADERS = {
    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
    'X-Requested-With': 'XMLHttpRequest',
    'Content-Type': 'application/x-www-form-urlencoded; charset=UTF-8'
};

const DELAY_BETWEEN_PLAYERS = 1200; // 1.2s delay to be polite

async function syncPlayer(player) {
    const { name, eloboard_id: wrId, gender } = player;
    const subdomain = gender === 'male' ? 'men' : 'women';
    
    console.log(`\n🎯 [${name}] (ID: ${wrId}, Sub: ${subdomain}) Syncing...`);
    
    try {
        const { data: html } = await axios.post(`https://eloboard.com/${subdomain}/bbs/view_list.php`, qs.stringify({
            p_name: name,
            last_id: 0,
            b_id: 'eloboard'
        }), { headers: HEADERS, timeout: 15000 });
        
        const $ = cheerio.load(html);
        const matches = [];
        const now = new Date();
        // Look back 48h to be extra safe against timezone/sync delays
        const limitDate = new Date(now.getTime() - (48 * 60 * 60 * 1000)).toISOString().split('T')[0];

        $('tr').each((i, el) => {
            const cells = $(el).find('td');
            if (cells.length >= 4) {
                const dateRaw = $(cells[0]).text().trim();
                const oppRaw = $(cells[1]).text().trim();
                const map = $(cells[2]).text().trim();
                const resultText = $(cells[3]).text().trim();
                const note = $(cells[5]) ? $(cells[5]).text().trim() : '';

                // Only matches with YYYY-MM-DD format (stable)
                if (/^\d{4}-\d{2}-\d{2}/.test(dateRaw)) {
                    if (dateRaw >= limitDate) {
                        const oppMatch = oppRaw.match(/^(.*?)\((.*?)\)$/);
                        const opponentName = oppMatch ? oppMatch[1] : oppRaw;
                        const opponentRace = (oppMatch ? oppMatch[2] : 'U').charAt(0).toUpperCase();
                        
                        // Parse result
                        const isWin = resultText.includes('+') || (!resultText.includes('패') && parseFloat(resultText) > 0);

                        matches.push({
                            player_name: name,
                            opponent_name: opponentName,
                            opponent_race: ['P','T','Z'].includes(opponentRace) ? opponentRace : 'U',
                            map,
                            is_win: isWin,
                            result_text: resultText,
                            match_date: dateRaw, // Eloboard registration date (As per CEO's instruction)
                            note: note, // (N경기) means match sequence in tournament
                            gender: gender // Added for better filtering
                        });
                    }
                }
            }
        });

        if (matches.length > 0) {
            console.log(`  ➕ Found ${matches.length} matches within window. Upserting...`);
            const { error: upsertError } = await supabase.from('eloboard_matches').upsert(matches, {
                onConflict: 'player_name, opponent_name, match_date, map, result_text, note'
            });

            if (upsertError) {
                console.error(`  ❌ Upsert Error for ${name}: ${upsertError.message}`);
                return 0;
            }
            console.log(`  ✅ Successfully synced ${matches.length} matches.`);
        } else {
            console.log(`  💤 No new matches in the last 48h.`);
        }

        // Update player's last sync status
        await supabase.from('players').update({
            last_synced_at: new Date().toISOString(),
            sync_status: 'verified'
        }).eq('id', player.id);

        return matches.length;

    } catch (e) {
        console.error(`  💥 Failed to sync [${name}]: ${e.message}`);
        return -1;
    }
}

async function startSync() {
    const startTime = Date.now();
    console.log(`🚀 NZU Pinpoint Sync V1 Starting (Time: ${new Date().toLocaleString()})`);
    
    // 1. Fetch players who have an eloboard_id
    const { data: players, error: fetchError } = await supabase
        .from('players')
        .select('id, name, eloboard_id, gender')
        .not('eloboard_id', 'is', null)
        .order('last_synced_at', { ascending: true }); // Sync oldest first

    if (fetchError || !players) {
        console.error('Failed to fetch players from Supabase:', fetchError?.message);
        return;
    }

    console.log(`📦 Found ${players.length} players to sync.`);
    
    let totalSuccess = 0;
    let totalFailed = 0;
    let totalNewMatches = 0;

    for (let i = 0; i < players.length; i++) {
        const player = players[i];
        process.stdout.write(`[${i + 1}/${players.length}] `);
        
        const count = await syncPlayer(player);
        if (count >= 0) {
            totalSuccess++;
            totalNewMatches += count;
        } else {
            totalFailed++;
        }

        // Polite delay
        if (i < players.length - 1) {
            await new Promise(r => setTimeout(r, DELAY_BETWEEN_PLAYERS));
        }
    }

    const duration = ((Date.now() - startTime) / 1000).toFixed(1);
    console.log(`\n🏁 Sync Finished in ${duration}s.`);
    console.log(`- Success: ${totalSuccess}`);
    console.log(`- Failed: ${totalFailed}`);
    console.log(`- New Matches Synced: ${totalNewMatches}`);

    // Log the sync result
    await supabase.from('sync_logs').insert({
        type: 'pinpoint_24h_sync',
        status: totalFailed === 0 ? 'success' : 'partial',
        processed_count: totalNewMatches,
        duration_ms: Date.now() - startTime,
        error_message: totalFailed > 0 ? `${totalFailed} players failed.` : null
    });
}

startSync();
