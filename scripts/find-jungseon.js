
const { createClient } = require('@supabase/supabase-js');
require('dotenv').config({ path: '.env.local' });

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const supabase = createClient(supabaseUrl, supabaseKey);

async function findJungSeon() {
  console.log('Searching for matches with note containing "정선"...');
  const { data, error } = await supabase
    .from('eloboard_matches')
    .select('*')
    .ilike('note', '%정선%')
    .limit(10);

  if (error) {
    console.error(error);
    return;
  }

  console.log(`Found ${data.length} matches.`);
  if (data.length > 0) {
    data.forEach(m => console.log(`[${m.match_date}] ${m.player_name} vs ${m.opponent_name} - Note: ${m.note}`));
  } else {
    console.log('No matches found with note containing "정선".');
  }
}

findJungSeon();
