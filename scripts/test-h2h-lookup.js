const { createClient } = require('@supabase/supabase-js');
require('dotenv').config({ path: '.env.local' });

const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY);

async function testH2H(p1, p2) {
    console.log(`\n🔍 Instant H2H Lookup: [${p1}] vs [${p2}]`);
    
    // 1. Get Player A's record against Player B
    const { data: recordsA } = await supabase
        .from('eloboard_matches')
        .select('*')
        .eq('player_name', p1)
        .eq('opponent_name', p2)
        .order('match_date', { ascending: false });

    // 2. Get Player B's record against Player A (for reverse lookup)
    const { data: recordsB } = await supabase
        .from('eloboard_matches')
        .select('*')
        .eq('player_name', p2)
        .eq('opponent_name', p1)
        .order('match_date', { ascending: false });

    console.log(`- Player 1 wins recorded: ${recordsA ? recordsA.filter(r => r.is_win).length : 0}`);
    console.log(`- Player 2 wins recorded: ${recordsB ? recordsB.filter(r => r.is_win).length : 0}`);
    
    if (recordsA && recordsA.length > 0) {
        console.log('\n--- Recent Encounters (Last 5) ---');
        recordsA.slice(0, 5).forEach(r => {
            console.log(`${r.match_date} | ${r.map} | ${r.is_win ? 'WIN' : 'LOSS'} | ${r.result_text}`);
        });
    } else {
        console.log('- No recent H2H records found in local DB.');
    }
}

async function start() {
    await testH2H('애공', '또봉순');
    await testH2H('슈슈', '규리야');
}

start();
