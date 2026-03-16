
const { createClient } = require('@supabase/supabase-js');
require('dotenv').config({ path: '.env.local' });

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const supabase = createClient(supabaseUrl, supabaseKey);

async function checkNames() {
  console.log('Fetching unique names from eloboard_matches...');
  
  const { data, error } = await supabase
    .from('eloboard_matches')
    .select('player_name, opponent_name');

  if (error) {
    console.error(error);
    return;
  }

  const names = new Set();
  data.forEach(m => {
    names.add(m.player_name);
    names.add(m.opponent_name);
  });

  const sortedNames = Array.from(names).sort();
  
  console.log('Searching for names containing "슬아" or "키링"...');
  const slaVariations = sortedNames.filter(n => n?.includes('슬아'));
  const kyiringVariations = sortedNames.filter(n => n?.includes('키링'));

  console.log('Sla variations:', slaVariations);
  console.log('Kyiring variations:', kyiringVariations);
}

checkNames();
