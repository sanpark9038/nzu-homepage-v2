
const { createClient } = require('@supabase/supabase-js');
require('dotenv').config({ path: '.env.local' });

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const supabase = createClient(supabaseUrl, supabaseKey);

async function checkNames() {
  console.log('Searching for names containing "슬아" or "키링" in ALL records...');
  
  // Use ilike and range to get more results if needed, but ilike should be enough to find patterns
  const { data: p1, error: e1 } = await supabase
    .from('eloboard_matches')
    .select('player_name, opponent_name')
    .or('player_name.ilike.%슬아%,opponent_name.ilike.%슬아%')
    .limit(10);

  const { data: p2, error: e2 } = await supabase
    .from('eloboard_matches')
    .select('player_name, opponent_name')
    .or('player_name.ilike.%키링%,opponent_name.ilike.%키링%')
    .limit(10);

  console.log('Sample names found for "슬아":');
  p1.forEach(m => console.log(`P: ${m.player_name}, O: ${m.opponent_name}`));

  console.log('\nSample names found for "키링":');
  p2.forEach(m => console.log(`P: ${m.player_name}, O: ${m.opponent_name}`));
}

checkNames();
