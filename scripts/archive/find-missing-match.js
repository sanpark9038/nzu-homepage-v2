
const { createClient } = require('@supabase/supabase-js');
require('dotenv').config({ path: '.env.local' });

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const supabase = createClient(supabaseUrl, supabaseKey);

async function findMatch() {
  console.log('Searching for match between 슬아 and 키링 with broader criteria...');
  
  // Search for any match where names might be embedded or different
  const { data, error } = await supabase
    .from('eloboard_matches')
    .select('*')
    .or(`player_name.ilike.%슬아%,opponent_name.ilike.%슬아%,player_name.ilike.%키링%,opponent_name.ilike.%키링%`);

  if (error) {
    console.error(error);
    return;
  }

  const exactH2H = data.filter(m => 
    (m.player_name.includes('키링') && m.opponent_name.includes('슬아')) ||
    (m.player_name.includes('슬아') && m.opponent_name.includes('키링'))
  );

  console.log(`Found ${exactH2H.length} exact H2H matches in the DB.`);
  exactH2H.forEach(m => console.log(`[${m.match_date}] ${m.player_name} vs ${m.opponent_name} - Note: ${m.note}`));

  if (exactH2H.length === 0) {
    console.log('\nChecking if they appeared in the same post (same note)...');
    const slaNotes = new Set(data.filter(m => m.player_name.includes('슬아') || m.opponent_name.includes('슬아')).map(m => m.note));
    const kyiringNotes = new Set(data.filter(m => m.player_name.includes('키링') || m.opponent_name.includes('키링')).map(m => m.note));
    
    const commonNotes = [...slaNotes].filter(n => kyiringNotes.has(n));
    console.log(`Common notes: ${commonNotes.length}`);
    commonNotes.forEach(n => console.log(`Common Post: ${n}`));
  }
}

findMatch();
