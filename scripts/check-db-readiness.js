
const { createClient } = require('@supabase/supabase-js');
require('dotenv').config({ path: '.env.local' });

const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY);

async function checkStatus() {
  console.log('--- Database Status Check ---');
  
  // 1. Players count
  const { count: playerCount, error: pError } = await supabase
    .from('players')
    .select('*', { count: 'exact', head: true });
  
  // 2. Players with eloboard_id count
  const { count: mappedCount, error: mError } = await supabase
    .from('players')
    .select('*', { count: 'exact', head: true })
    .not('eloboard_id', 'is', null);

  // 3. Matches count
  const { count: matchCount, error: matchError } = await supabase
    .from('eloboard_matches')
    .select('*', { count: 'exact', head: true });

  console.log(`Total Players: ${playerCount}`);
  console.log(`Mapped Players (with eloboard_id): ${mappedCount}`);
  console.log(`Total Matches: ${matchCount}`);
  
  if (playerCount > 0) {
    const { data: samplePlayers } = await supabase.from('players').select('name, eloboard_id, gender').limit(5);
    console.log('\nSample Players Data:');
    console.table(samplePlayers);
  }
}

checkStatus();
