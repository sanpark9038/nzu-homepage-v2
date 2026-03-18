const axios = require('axios');
const cheerio = require('cheerio');
const { createClient } = require('@supabase/supabase-js');
require('dotenv').config({ path: '.env.local' });

const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY);

async function verifyPlayer(name, wrId) {
    console.log(`\n🔍 Verifying [${name}]...`);
    
    // 1. Get from DB
    const { data: dbPlayer } = await supabase
        .from('players')
        .select('detailed_stats, university')
        .eq('name', name)
        .single();

    // 2. Get from Web
    const url = `https://eloboard.com/women/bbs/board.php?bo_table=bj_list&wr_id=${wrId}`;
    const { data: html } = await axios.get(url, { headers: { 'User-Agent': 'Mozilla/5.0' } });
    const $ = cheerio.load(html);
    
    // Extract info from profile tables
    const profileText = $('.bj_profile_table').text();
    const statsText = $('.bj_stats_table').text() || $('td:contains("전")').text();

    console.log('--- Database Side ---');
    console.log(`- University: ${dbPlayer.university}`);
    console.log(`- Win Rate: ${dbPlayer.detailed_stats.win_rate}%`);
    console.log(`- Race Stats: T:${dbPlayer.detailed_stats.race_stats.T.w}W ${dbPlayer.detailed_stats.race_stats.T.l}L | P:${dbPlayer.detailed_stats.race_stats.P.w}W ${dbPlayer.detailed_stats.race_stats.P.l}L | Z:${dbPlayer.detailed_stats.race_stats.Z.w}W ${dbPlayer.detailed_stats.race_stats.Z.l}L`);

    console.log('\n--- Web Side (Raw Match) ---');
    // Look for string like "34전 19승 15패"
    const match = statsText.match(/(\d+)전\s+(\d+)승\s+(\d+)패/);
    if (match) {
        console.log(`- Found on Web: ${match[0]}`);
        const total = parseInt(match[1]);
        const wins = parseInt(match[2]);
        const dbTotal = dbPlayer.detailed_stats.race_stats.T.w + dbPlayer.detailed_stats.race_stats.T.l + 
                        dbPlayer.detailed_stats.race_stats.P.w + dbPlayer.detailed_stats.race_stats.P.l +
                        dbPlayer.detailed_stats.race_stats.Z.w + dbPlayer.detailed_stats.race_stats.Z.l;
        console.log(`- DB Total: ${dbTotal} (Matches Synced)`);
    } else {
        console.log('- Could not find summary match string on web, check screenshot/HTML.');
    }
}

async function run() {
    await verifyPlayer('애공', '223');
    await verifyPlayer('란란', '350');
}

run();
