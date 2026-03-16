
const { createClient } = require('@supabase/supabase-js');
require('dotenv').config({ path: '.env.local' });

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const supabase = createClient(supabaseUrl, supabaseKey);

async function checkMatches() {
  console.log('Fetching all matches for 슬아...');
  
  const { data: slaMatches, error } = await supabase
    .from('eloboard_matches')
    .select('player_name, opponent_name, match_date, map, result_text')
    .or('player_name.eq.슬아,opponent_name.eq.슬아')
    .order('match_date', { ascending: false });

  if (error) {
    console.error(error);
    return;
  }

  console.log(`Found ${slaMatches.length} matches for 슬아.`);
  
  const opponents = new Set();
  slaMatches.forEach(m => {
    const opp = m.player_name === '슬아' ? m.opponent_name : m.player_name;
    opponents.add(opp);
    if (opp.includes('키링') || '키링'.includes(opp)) {
      console.log(`!!! MATCH FOUND: [${m.match_date}] ${m.player_name} vs ${m.opponent_name} (${m.result_text})`);
    }
  });

  console.log('\nOpponents of 슬아:');
  console.log(Array.from(opponents).join(', '));
}

checkMatches();
