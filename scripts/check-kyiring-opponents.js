
const { createClient } = require('@supabase/supabase-js');
require('dotenv').config({ path: '.env.local' });

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const supabase = createClient(supabaseUrl, supabaseKey);

async function checkMatches() {
  console.log('Fetching all matches for 키링...');
  
  const { data: kyiringMatches, error } = await supabase
    .from('eloboard_matches')
    .select('player_name, opponent_name, match_date, map, result_text')
    .or('player_name.eq.키링,opponent_name.eq.키링')
    .order('match_date', { ascending: false });

  if (error) {
    console.error(error);
    return;
  }

  console.log(`Found ${kyiringMatches.length} matches for 키링.`);
  
  const opponents = new Set();
  kyiringMatches.forEach(m => {
    const opp = m.player_name === '키링' ? m.opponent_name : m.player_name;
    opponents.add(opp);
    if (opp.includes('슬아') || '슬아'.includes(opp)) {
      console.log(`!!! MATCH FOUND: [${m.match_date}] ${m.player_name} vs ${m.opponent_name} (${m.result_text})`);
    }
  });

  console.log('\nOpponents of 키링:');
  console.log(Array.from(opponents).join(', '));
}

checkMatches();
