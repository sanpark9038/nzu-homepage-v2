const axios = require('axios');
const cheerio = require('cheerio');
const qs = require('querystring');
const { createClient } = require('@supabase/supabase-js');
require('dotenv').config({ path: '.env.local' });

const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY);

const HEADERS = {
    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
    'X-Requested-With': 'XMLHttpRequest',
    'Content-Type': 'application/x-www-form-urlencoded; charset=UTF-8'
};

async function analyzePlayer(name, wrId) {
    console.log(`\n📊 Analyzing [${name}] (ID: ${wrId})...`);
    
    let allMatches = [];
    try {
        // Fetch full history from view_list.php
        const { data: html } = await axios.post('https://eloboard.com/women/bbs/view_list.php', qs.stringify({
            p_name: name,
            last_id: 0,
            b_id: 'eloboard'
        }), { headers: HEADERS, timeout: 15000 });
        
        const $ = cheerio.load(html);
        $('tr').each((i, el) => {
            const cells = $(el).find('td');
            if (cells.length >= 4) {
                const date = $(cells[0]).text().trim();
                const oppRaw = $(cells[1]).text().trim(); // "상대(Race)"
                const map = $(cells[2]).text().trim();
                const resultText = $(cells[3]).text().trim();
                const note = $(cells[5]) ? $(cells[5]).text().trim() : '';

                const oppMatch = oppRaw.match(/^(.*?)\((.*?)\)$/);
                const opponentName = oppMatch ? oppMatch[1] : oppRaw;
                const opponentRace = oppMatch ? oppMatch[2] : 'U';

                const win = resultText.includes('+') || (!resultText.includes('패') && parseFloat(resultText) > 0);
                
                allMatches.push({
                    date,
                    opponent: opponentName,
                    opponentRace,
                    map,
                    win,
                    result: resultText,
                    note
                });
            }
        });
    } catch (e) {
        console.error(`- Error fetching history: ${e.message}`);
        return;
    }

    if (allMatches.length === 0) {
        console.log(`- No matches found for ${name}`);
        return;
    }

    // Calculate Stats
    const stats = {
        race_stats: { T: { w: 0, l: 0 }, Z: { w: 0, l: 0 }, P: { w: 0, l: 0 } },
        map_stats: {},
        recent: { w: 0, l: 0, total: 10 },
        last_10: []
    };

    allMatches.forEach((m, i) => {
        // vs Race Stats
        if (stats.race_stats[m.opponentRace]) {
            if (m.win) stats.race_stats[m.opponentRace].w++;
            else stats.race_stats[m.opponentRace].l++;
        }

        // Map Stats
        if (!stats.map_stats[m.map]) stats.map_stats[m.map] = { w: 0, l: 0 };
        if (m.win) stats.map_stats[m.map].w++;
        else stats.map_stats[m.map].l++;

        // Last 10
        if (i < 10) {
            stats.last_10.push(m.win ? 'W' : 'L');
            if (m.win) stats.recent.w++;
            else stats.recent.l++;
        }
    });

    // Save to Supabase
    const { error } = await supabase.from('players').update({
        detailed_stats: stats,
        match_history: allMatches.slice(0, 100), // Store last 100 games for instant H2H
        last_synced_at: new Date().toISOString()
    }).eq('name', name);

    if (error) console.error(`❌ DB Error: ${error.message}`);
    else console.log(`✅ [${name}] Analysis Synced. (${allMatches.length} games parsed)`);
}

async function start() {
    const { data: players } = await supabase.from('players').select('name, eloboard_id').not('eloboard_id', 'is', null);
    
    for (const p of players) {
        await analyzePlayer(p.name, p.eloboard_id);
        await new Promise(r => setTimeout(r, 1000));
    }
}

start();
