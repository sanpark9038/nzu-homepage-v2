
const { createClient } = require('@supabase/supabase-js');
require('dotenv').config({ path: '.env.local' });

const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY);

async function listMissingPlayers() {
  const { data, error } = await supabase
    .from('players')
    .select('name, university, tier, race')
    .is('eloboard_id', null)
    .order('name');

  if (error) {
    console.error(error);
    return;
  }

  console.log(`--- Missing Eloboard ID: ${data.length} Players ---`);
  console.table(data);
}

listMissingPlayers();
