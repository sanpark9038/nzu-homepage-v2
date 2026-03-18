
const { createClient } = require('@supabase/supabase-js');
require('dotenv').config({ path: '.env.local' });

const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY);

async function cleanupSla() {
  console.log('Cleaning up duplicate/wrong Sla matches...');
  const { data, error } = await supabase
    .from('eloboard_matches')
    .delete()
    .or('player_name.eq.슬아,opponent_name.eq.슬아')
    .eq('match_date', '2026-03-16');

  if (error) console.error(error);
  else console.log('Cleanup successful.');
}

cleanupSla();
