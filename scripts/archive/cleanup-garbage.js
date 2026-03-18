
const { createClient } = require('@supabase/supabase-js');
require('dotenv').config({ path: '.env.local' });

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const supabase = createClient(supabaseUrl, supabaseKey);

async function cleanupGarbage() {
  console.log('Identifying matches with broken encoding (garbage names)...');
  
  // Fetch all matches from today (when many garbage rows were likely added or updated)
  const today = new Date().toISOString().split('T')[0];
  const { data, error } = await supabase
    .from('eloboard_matches')
    .select('id, player_name, opponent_name, note')
    .ilike('player_name', '%%'); // Search for the replacement character or other signs of broken encoding

  if (error) {
    console.error(error);
    return;
  }

  console.log(`Found ${data.length} matches with obviously broken names.`);
  if (data.length > 0) {
    const ids = data.map(m => m.id);
    console.log(`Deleting ${ids.length} broken matches...`);
    
    // Deleting in chunks of 500
    for (let i = 0; i < ids.length; i += 500) {
      const chunk = ids.slice(i, i + 500);
      const { error: delErr } = await supabase
        .from('eloboard_matches')
        .delete()
        .in('id', chunk);
      if (delErr) console.error('Delete error:', delErr);
    }
    console.log('Cleanup complete!');
  } else {
    // Try another approach: search for common broken Korean patterns
    // e.g. "궎留" (broken '키링')
    const { data: d2, error: e2 } = await supabase
      .from('eloboard_matches')
      .select('id, player_name')
      .ilike('player_name', '%궎%');
    
    if (d2 && d2.length > 0) {
      console.log(`Found ${d2.length} more broken matches (pattern search). Deleting...`);
      const ids2 = d2.map(m => m.id);
      await supabase.from('eloboard_matches').delete().in('id', ids2);
      console.log('Pattern cleanup complete!');
    }
  }
}

cleanupGarbage();
