const { createClient } = require('@supabase/supabase-js');
require('dotenv').config({ path: '.env.local' });

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
);

async function checkSchema() {
  const { data, error } = await supabase
    .from('eloboard_matches')
    .select('*')
    .limit(1);
  
  if (error) {
    console.error('Error selecting from eloboard_matches:', error.message);
  } else {
    console.log('Successfully selected from eloboard_matches.');
    if (data.length > 0) {
        console.log('Columns:', Object.keys(data[0]));
    } else {
        console.log('No data found to check columns.');
    }
  }
}

checkSchema();
