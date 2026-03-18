
const { createClient } = require('@supabase/supabase-js');
require('dotenv').config({ path: '.env.local' });

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const supabase = createClient(supabaseUrl, supabaseKey);

async function checkMatches() {
  console.log('Checking matches for 슬아 and 키링...');
  
  // Search for 슬아
  const { data: sla, error: errSla } = await supabase
    .from('eloboard_matches')
    .select('*')
    .or('player_name.ilike.%슬아%,opponent_name.ilike.%슬아%')
    .limit(5);

  console.log('Sla matches search results:', sla?.length || 0);
  if (sla) sla.forEach(m => console.log(`[${m.match_date}] ${m.player_name} vs ${m.opponent_name} (${m.result_text})`));

  // Search for 키링
  const { data: kyiring, error: errKyiring } = await supabase
    .from('eloboard_matches')
    .select('*')
    .or('player_name.ilike.%키링%,opponent_name.ilike.%키링%')
    .limit(5);

  console.log('\nKyiring matches search results:', kyiring?.length || 0);
  if (kyiring) kyiring.forEach(m => console.log(`[${m.match_date}] ${m.player_name} vs ${m.opponent_name} (${m.result_text})`));

  // Search for the specific match between them
  const { data: h2h, error: errH2H } = await supabase
    .from('eloboard_matches')
    .select('*')
    .or(`and(player_name.ilike.%슬아%,opponent_name.ilike.%키링%),and(player_name.ilike.%키링%,opponent_name.ilike.%슬아%)`);

  console.log('\nDirect H2H search results:', h2h?.length || 0);
  if (h2h) h2h.forEach(m => console.log(`[${m.match_date}] ${m.player_name} vs ${m.opponent_name} (${m.result_text})`));
}

checkMatches();
