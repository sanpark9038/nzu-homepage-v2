const { createClient } = require('@supabase/supabase-js');
require('dotenv').config({ path: '.env.local' });

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
);

async function verify() {
    console.log('--- VERIFICATION START ---');
    
    // 1. 박준오 (Male, ID: 44)
    const { data: pjo } = await supabase
        .from('eloboard_matches')
        .select('player_name, gender, match_date, opponent_name, map')
        .eq('player_name', '박준오')
        .limit(3);
    console.log('\n[박준오 (male)]');
    console.table(pjo);

    // 2. 파이 (Female, ID: 44)
    const { data: pi } = await supabase
        .from('eloboard_matches')
        .select('player_name, gender, match_date, opponent_name, map')
        .eq('player_name', '파이')
        .limit(3);
    console.log('\n[파이 (female)]');
    console.table(pi);

    // 3. Gender stats
    const { data: stats } = await supabase
        .from('eloboard_matches')
        .select('gender');
    
    const genderCounts = stats.reduce((acc, curr) => {
        acc[curr.gender] = (acc[curr.gender] || 0) + 1;
        return acc;
    }, {});
    console.log('\n[성별 통계]');
    console.table(genderCounts);

    console.log('\n--- VERIFICATION END ---');
}

verify();
