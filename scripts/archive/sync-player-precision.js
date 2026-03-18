const axios = require('axios');
const cheerio = require('cheerio');
const qs = require('querystring');
const fs = require('fs');
const { createClient } = require('@supabase/supabase-js');
require('dotenv').config({ path: '.env.local' });

const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY);
const rosterConfig = JSON.parse(fs.readFileSync('roster-config.json', 'utf8'));

const HEADERS = {
    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
    'X-Requested-With': 'XMLHttpRequest',
    'Content-Type': 'application/x-www-form-urlencoded; charset=UTF-8'
};

function getUniversity(name) {
    for (const [univ, members] of Object.entries(rosterConfig)) {
        if (members.includes(name)) return univ;
    }
    return '기타';
}

async function analyzePlayer(name, wrId, university) {
    console.log(`\n📊 Generating Detailed Stats for [${name}] (ID: ${wrId}) Univ: [${university}]...`);
    
    let allMatches = [];
    try {
        const { data: html } = await axios.post('https://eloboard.com/women/bbs/view_list.php', qs.stringify({
            p_name: name,
            last_id: 0,
            b_id: 'eloboard'
        }), { headers: HEADERS, timeout: 20000 });
        
        const $ = cheerio.load(html);
        $('tr').each((i, el) => {
            const cells = $(el).find('td');
            if (cells.length >= 4) {
                const dateRaw = $(cells[0]).text().trim();
                const oppRaw = $(cells[1]).text().trim();
                const map = $(cells[2]).text().trim();
                const resultText = $(cells[3]).text().trim();
                const note = $(cells[5]) ? $(cells[5]).text().trim() : '';

                const oppMatch = oppRaw.match(/^(.*?)\((.*?)\)$/);
                const opponentName = oppMatch ? oppMatch[1] : oppRaw;
                const opponentRace = oppMatch ? oppMatch[2] : 'U';

                // Date parsing (e.g. 2024-12-26)
                const date = dateRaw.match(/^\d{4}-\d{2}-\d{2}/) ? dateRaw : null;
                const is_win = resultText.includes('+') || (!resultText.includes('패') && parseFloat(resultText) > 0);
                
                if (date && opponentName) {
                    allMatches.push({
                        player_name: name,
                        opponent_name: opponentName,
                        opponent_race: opponentRace,
                        map,
                        is_win,
                        result_text: resultText,
                        match_date: date,
                        note
                    });
                }
            }
        });
    } catch (e) {
        console.error(`- Error fetching history: ${e.message}`);
        return;
    }

    if (allMatches.length === 0) {
        console.log(`- No data found.`);
        return;
    }

    // 1. Process Stats
    const stats = {
        race_stats: { T: { w: 0, l: 0 }, Z: { w: 0, l: 0 }, P: { w: 0, l: 0 } },
        map_stats: {},
        last_10: allMatches.slice(0, 10).map(m => m.is_win ? 'W' : 'L'),
        win_rate: 0
    };

    allMatches.forEach(m => {
        if (stats.race_stats[m.opponent_race]) {
            if (m.is_win) stats.race_stats[m.opponent_race].w++;
            else stats.race_stats[m.opponent_race].l++;
        }
        if (!stats.map_stats[m.map]) stats.map_stats[m.map] = { w: 0, l: 0 };
        if (m.is_win) stats.map_stats[m.map].w++;
        else stats.map_stats[m.map].l++;
    });

    const total = allMatches.length;
    const wins = allMatches.filter(m => m.is_win).length;
    stats.win_rate = total > 0 ? (wins / total * 100).toFixed(1) : 0;

    // 2. Batch Upsert Matches
    // Deduplicate to avoid "cannot affect row a second time" error
    const uniqueMatches = [];
    const seen = new Set();
    allMatches.forEach(m => {
        const key = `${m.match_date}|${m.opponent_name}|${m.map}|${m.result_text}`;
        if (!seen.has(key)) {
            seen.add(key);
            uniqueMatches.push(m);
        }
    });

    const { error: matchError } = await supabase.from('eloboard_matches').upsert(uniqueMatches, {
        onConflict: 'player_name, opponent_name, match_date, map, result_text'
    });
    if (matchError) console.error(`- Match Upsert Error: ${matchError.message}`);

    // 3. Update Player Table
    const { error: playerError } = await supabase.from('players').update({
        detailed_stats: stats,
        university: university,
        last_synced_at: new Date().toISOString()
    }).eq('name', name);

    if (playerError) console.error(`- Player Update Error: ${playerError.message}`);
    else console.log(`✅ [${name}] Stats & ${uniqueMatches.length} Matches Synced.`);
}

async function start() {
    console.log('🚀 Starting Precision Analysis & Roster Sync...');
    
    // 1. Fetch updated mapping from the eloboard rosters
    console.log('--- Fetching University Mappings ---');
    const univs = ['늪지대', '씨나인', '염석대', '캄성여대', 'CP', '무친대', 'NSU'];
    const autoMapping = {};
    
    for(const u of univs) {
        try {
            const url = `https://eloboard.com/univ/bbs/board.php?bo_table=all_bj_list&univ_name=${encodeURIComponent(u)}`;
            const { data } = await axios.get(url, { headers: { 'User-Agent': 'Mozilla/5.0' } });
            const $ = cheerio.load(data);
            $('table tbody tr').each((i, row) => {
                const nameText = $(row).find('td').eq(0).text().trim();
                const cleanName = nameText.replace(/\(.*\)/, '').trim();
                if (cleanName) autoMapping[cleanName] = u;
            });
            console.log(`- Loaded mapping for [${u}]`);
        } catch (e) {
            console.error(`- Failed to map ${u}: ${e.message}`);
        }
    }

    const { data: players } = await supabase.from('players').select('name, eloboard_id').not('eloboard_id', 'is', null);
    
    for (const p of players) {
        // Use auto-mapping first, then config, then default
        const university = autoMapping[p.name] || getUniversity(p.name);
        await analyzePlayer(p.name, p.eloboard_id, university);
        await new Promise(r => setTimeout(r, 1000));
    }
    console.log('🏁 Sync Finished.');
}

start();
