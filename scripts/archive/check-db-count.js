
const { createClient } = require('@supabase/supabase-js');
require('dotenv').config({ path: '.env.local' });

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const supabase = createClient(supabaseUrl, supabaseKey);

async function checkCount() {
  const { count, error } = await supabase
    .from('eloboard_matches')
    .select('*', { count: 'exact', head: true });

  if (error) {
    console.error(error);
    return;
  }

  console.log('Total rows in eloboard_matches:', count);
}

checkCount();
