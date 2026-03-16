
const { createClient } = require('@supabase/supabase-js');
require('dotenv').config({ path: '.env.local' });

const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY);

async function checkFinalH2H() {
  const { data, error } = await supabase
    .from('eloboard_matches')
    .select('*')
    .or('and(player_name.eq.슬아,opponent_name.eq.키링),and(player_name.eq.키링,opponent_name.eq.슬아)');

  if (error) {
    console.error(error);
    return;
  }

  const slaVskyiring = data.filter(m => m.player_name === '슬아');
  console.log(`Final H2H matches for Sla vs Kyiring: ${slaVskyiring.length}`);
  slaVskyiring.forEach(m => console.log(`[${m.match_date}] ${m.map} - Result: ${m.result_text} | Note: ${m.note}`));
}

checkFinalH2H();
