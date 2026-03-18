const axios = require('axios');
const cheerio = require('cheerio');
const qs = require('querystring');
const { createClient } = require('@supabase/supabase-js');
require('dotenv').config({ path: '.env.local' });

// Supabase Init
const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY);

// Core NZU Members (Update IDs as discovered)
const NZU_MEMBERS = [
    { name: '애공', id: '223' },
    { name: '키링', id: '827' },
    { name: '란란', id: '350' },
    { name: '늪신', id: '400' },
    { name: '슬아', id: '57' },
    { name: '슈슈', id: '668' },
    { name: '예실', id: '846' },
    { name: '연블비', id: '627' },
    { name: '다라츄', id: '927' },
    { name: '아링', id: '953' },
    { name: '찡찡시아', id: '955' },
    { name: '정연이', id: '424' },
    { name: '지아송', id: '981' }
];

const HEADERS = {
    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
    'X-Requested-With': 'XMLHttpRequest',
    'Content-Type': 'application/x-www-form-urlencoded; charset=UTF-8'
};

async function syncPlayer(player) {
    console.log(`\n🔄 Syncing [${player.name}] (Eloboard ID: ${player.id})...`);
    
    // 1. Fetch Basic Info (ELO, Season Results)
    const profileUrl = `https://eloboard.com/women/bbs/board.php?bo_table=bj_list&wr_id=${player.id}`;
    let basicStats = { elo: 0, wins: 0, losses: 0, race: 'P', tier: 'N/A' };
    
    try {
        const { data: profileHtml } = await axios.get(profileUrl, { headers: { 'User-Agent': 'Mozilla/5.0' } });
        const $ = cheerio.load(profileHtml);
        
        const eloText = $('th:contains("ELO")').next('td').text().trim() || 
                        $('th:contains("여성ELO")').next('td').text().trim();
        basicStats.elo = Math.round(parseFloat(eloText.replace(/,/g, '')) || 0);

        const matchStr = $('td:contains("승")').filter((i, el) => $(el).text().includes('패')).first().text();
        const wMatch = matchStr.match(/(\d+)승/);
        const lMatch = matchStr.match(/(\d+)패/);
        if (wMatch) basicStats.wins = parseInt(wMatch[1]);
        if (lMatch) basicStats.losses = parseInt(lMatch[1]);
        
        // Race/Tier extraction
        const title = $('title').text(); // e.g. "애공(1) P"
        const tierMatch = title.match(/\((.*?)\)/);
        if (tierMatch) basicStats.tier = tierMatch[1];
        if (title.includes(' P')) basicStats.race = 'P';
        else if (title.includes(' T')) basicStats.race = 'T';
        else if (title.includes(' Z')) basicStats.race = 'Z';

    } catch (e) {
        console.error(`- Profile fetch failed: ${e.message}`);
    }

    // 2. Fetch Match History (view_list.php)
    let matches = [];
    try {
        const { data: listHtml } = await axios.post('https://eloboard.com/women/bbs/view_list.php', qs.stringify({
            p_name: player.name,
            last_id: 0,
            b_id: 'eloboard'
        }), { headers: HEADERS });
        
        const $l = cheerio.load(listHtml);
        $l('tr').each((i, el) => {
            const cells = $l(el).find('td');
            if (cells.length >= 6) {
                matches.push({
                    date: $l(cells[0]).text().trim(),
                    opponent: $l(cells[1]).text().trim(),
                    map: $l(cells[2]).text().trim(),
                    result: $l(cells[3]).text().trim(), // e.g. "+15.1" or "패(-4)"
                    note: $l(cells[5]).text().trim()
                });
            }
        });
        console.log(`- Found ${matches.length} recent matches.`);
    } catch (e) {
        console.error(`- Match fetch failed: ${e.message}`);
    }

    // 3. Update Supabase
    const payload = {
        name: player.name,
        eloboard_id: player.id,
        elo_point: basicStats.elo,
        total_wins: basicStats.wins,
        total_losses: basicStats.losses,
        tier: basicStats.tier,
        race: basicStats.race,
        last_synced_at: new Date().toISOString()
    };

    const { data: existing } = await supabase.from('players').select('id').eq('name', player.name).single();
    if (existing) {
        await supabase.from('players').update(payload).eq('id', existing.id);
        console.log(`✅ [${player.name}] Stats Updated.`);
    } else {
        await supabase.from('players').insert(payload);
        console.log(`🆕 [${player.name}] Inserted.`);
    }

    // Optionally sync matches to 'matches' table
    // (This would require finding matching player IDs for opponents)
}

async function runMasterSync() {
    console.log('🚀 NZU Master Sync Engine Starting...');
    for (const p of NZU_MEMBERS) {
        await syncPlayer(p);
        await new Promise(r => setTimeout(r, 1000)); // Rate limit protection
    }
    console.log('\n🏁 Sync Finished.');
}

runMasterSync();
