
const { createClient } = require('@supabase/supabase-js');
require('dotenv').config({ path: '.env.local' });

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const supabase = createClient(supabaseUrl, supabaseKey);

async function checkTables() {
  console.log('Checking for tables...');
  
  // Try to list schemas/tables if allowed, or just try common names
  const tables = ['players', 'master_roster', 'eloboard_players'];
  for (const t of tables) {
    const { data, error } = await supabase.from(t).select('*').limit(1);
    if (!error) {
      console.log(`Table exists: ${t}`);
    } else {
      console.log(`Table ${t} check error: ${error.message}`);
    }
  }
}

checkTables();
