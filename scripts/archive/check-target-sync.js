
const { createClient } = require('@supabase/supabase-js');
require('dotenv').config({ path: '.env.local' });

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const supabase = createClient(supabaseUrl, supabaseKey);

async function checkSync() {
  console.log('Fetching matches from specific post...');
  const { data, error } = await supabase
    .from('eloboard_matches')
    .select('*')
    .eq('note', '정선숲퍼컵 B조 4경기');

  if (error) {
    console.error(error);
    return;
  }

  console.log(`Found ${data.length} matches.`);
  data.forEach(m => console.log(`[${m.match_date}] ${m.player_name} vs ${m.opponent_name}`));
}

checkSync();
