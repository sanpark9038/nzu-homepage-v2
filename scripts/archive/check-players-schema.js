
const { createClient } = require('@supabase/supabase-js');
require('dotenv').config({ path: '.env.local' });

const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY);

async function checkSchema() {
  const { data, error } = await supabase.from('players').select('*').limit(1);
  if (data && data.length > 0) {
    console.log('Columns in players table:', Object.keys(data[0]));
  } else {
    console.log('No data in players table or error:', error?.message);
  }
}
checkSchema();
