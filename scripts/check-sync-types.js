
const { createClient } = require('@supabase/supabase-js');
require('dotenv').config({ path: '.env.local' });

const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY);

async function checkSyncType() {
  const { data, error } = await supabase
    .from('sync_logs')
    .select('type, created_at, status')
    .order('created_at', { ascending: false })
    .limit(20);

  if (data) {
    console.table(data);
  } else {
    console.error(error);
  }
}
checkSyncType();
