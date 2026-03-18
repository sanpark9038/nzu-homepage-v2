const axios = require('axios');
const cheerio = require('cheerio');
const iconv = require('iconv-lite');
const { createClient } = require('@supabase/supabase-js');
const fs = require('fs');
require('dotenv').config({ path: '.env.local' });

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
);

// --- CONFIGURATION ---
const MALE_BASE_URL = 'https://eloboard.com/men/bbs/board.php?bo_table=bj_list';
const FEMALE_BASE_URL = 'https://eloboard.com/women/bbs/board.php?bo_table=bj_list';
const RETRY_LIMIT = 3;
const RETRY_DELAY = 3000;
const BATCH_SIZE = 5; 
const MIN_DATE = '2025-01-01'; 

async function sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}

async function fetchWithRetry(url, retries = RETRY_LIMIT) {
    for (let i = 0; i < retries; i++) {
        try {
            const response = await axios.get(url, {
                responseType: 'arraybuffer',
                headers: { 
                    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
                },
                timeout: 15000
            });
            
            const buffer = response.data;
            const contentType = response.headers['content-type'] || '';
            let encoding = 'utf-8';
            
            if (contentType.includes('euc-kr') || contentType.includes('cp949')) {
                encoding = 'cp949';
            }

            let html = iconv.decode(buffer, encoding);
            
            if (encoding === 'utf-8' && (html.includes('charset=euc-kr') || html.includes('charset=cp949'))) {
                html = iconv.decode(buffer, 'cp949');
            }
            return html;
        } catch (error) {
            console.warn(`[Retry ${i+1}/${retries}] Failed to fetch ${url}: ${error.message}`);
            if (i === retries - 1) throw error;
            await sleep(RETRY_DELAY * (i + 1));
        }
    }
}

async function scrapePlayerMatches(player) {
    const { name: player_name, wr_id: eloboard_id, gender } = player;
    if (!eloboard_id) return 0;

    const baseUrl = gender === 'male' ? MALE_BASE_URL : FEMALE_BASE_URL;
    console.log(`🔍 Scraping [${player_name}] (${gender}, ID: ${eloboard_id})...`);
    const url = `${baseUrl}&wr_id=${eloboard_id}`;
    
    try {
        const html = await fetchWithRetry(url);
        const $ = cheerio.load(html);
        const matches = [];

        $('table tr').each((i, row) => {
            const cells = $(row).find('td');
            if (cells.length < 5) return;

            const dateText = $(cells[0]).text().trim();
            if (!/^\d{2}-\d{2}-\d{2}$/.test(dateText) && !/^\d{4}-\d{2}-\d{2}$/.test(dateText)) return;

            const match_date = dateText.length === 8 ? `20${dateText}` : dateText;
            if (match_date < MIN_DATE) return; 

            let result_text, is_win, map, opponent_raw, turn, memo;

            const col1 = $(cells[1]).text().trim();
            const col3 = $(cells[3]).text().trim();

            if (col1.includes('(')) {
                opponent_raw = col1;
                map = $(cells[2]).text().trim();
                result_text = col3;
                is_win = result_text.includes('+') || result_text.includes('승');
            } else {
                result_text = col1;
                is_win = result_text.includes('+') || result_text.includes('승');
                map = $(cells[2]).text().trim();
                opponent_raw = col3;
            }

            turn = $(cells[4]).text().trim();
            memo = cells.length > 5 ? $(cells[5]).text().trim() : '';

            const raceMatch = opponent_raw.match(/\(([PTZR])\)/i);
            const opponent_race = raceMatch ? raceMatch[1].toUpperCase() : 'U';
            const opponent_name = opponent_raw.replace(/\(.*?\)/, '').trim();

            if (!opponent_name || opponent_name.includes('.') || opponent_name.length > 20) {
                return;
            }

            matches.push({
                player_name,
                gender,
                match_date,
                opponent_name,
                opponent_race,
                map,
                result_text,
                is_win,
                note: `[${turn}] ${memo}`.trim(),
                created_at: new Date().toISOString()
            });
        });

        if (matches.length > 0) {
            const seen = new Set();
            const uniqueMatches = matches.filter(m => {
                const key = `${m.player_name}|${m.opponent_name}|${m.match_date}|${m.map}|${m.result_text}`;
                if (seen.has(key)) return false;
                seen.add(key);
                return true;
            });

            console.log(`  📊 Found ${uniqueMatches.length} unique matches. Upserting...`);
            const { error } = await supabase
                .from('eloboard_matches')
                .upsert(uniqueMatches, { 
                    onConflict: 'player_name, opponent_name, match_date, map, result_text' 
                });
            
            if (error) {
                console.error(`  ❌ DB Upsert Error for ${player_name}:`, error.message);
                return 0;
            }
            return matches.length;
        }
        return 0;

    } catch (error) {
        console.error(`  ❌ Failed to process ${player_name}:`, error.message);
        return 0;
    }
}

async function startSync() {
    const startTime = Date.now();
    console.log('🚀 NZU Gender-Aware Sync Engine Starting...');

    try {
        const metadata = JSON.parse(fs.readFileSync('scripts/player_metadata.json', 'utf8'));
        console.log(`✅ Targeted ${metadata.length} players from metadata.`);

        let totalNewMatches = 0;
        
        for (let i = 0; i < metadata.length; i += BATCH_SIZE) {
            const batch = metadata.slice(i, i + BATCH_SIZE);
            const results = await Promise.all(batch.map(p => scrapePlayerMatches(p)));
            totalNewMatches += results.reduce((a, b) => a + b, 0);
            
            if (i + BATCH_SIZE < metadata.length) {
                await sleep(1000);
            }
        }

        const duration = (Date.now() - startTime) / 1000;
        console.log(`\n✨ Sync Completed!`);
        console.log(`- Total Processed: ${metadata.length} players`);
        console.log(`- New/Updated Matches: ${totalNewMatches}`);
        console.log(`- Duration: ${duration}s`);

        await supabase.from('sync_logs').insert({
            type: 'gender_aware_sync',
            status: 'success',
            processed_count: totalNewMatches,
            duration_ms: Date.now() - startTime
        });

    } catch (err) {
        console.error('💥 Critical Error:', err.message);
    }
}

startSync();
