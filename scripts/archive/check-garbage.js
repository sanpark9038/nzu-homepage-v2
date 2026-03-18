
const { createClient } = require('@supabase/supabase-js');
require('dotenv').config({ path: '.env.local' });

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const supabase = createClient(supabaseUrl, supabaseKey);

async function checkGarbage() {
  console.log('Checking for potentially broken names...');
  const { data, error } = await supabase
    .from('eloboard_matches')
    .select('player_name')
    .limit(100);

  if (error) {
    console.error(error);
    return;
  }

  const broken = data.filter(m => /[\uFFFD]/.test(m.player_name));
  console.log(`Found ${broken.length} potentially broken names in the first 100.`);
  if (broken.length > 0) {
    broken.slice(0, 10).forEach(m => console.log(`- ${m.player_name}`));
  }
}

checkGarbage();
