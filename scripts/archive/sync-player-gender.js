const { createClient } = require('@supabase/supabase-js');
const fs = require('fs');
require('dotenv').config({ path: '.env.local' });

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
);

async function syncPlayerGender() {
    console.log('🔄 Syncing player gender from metadata...');
    try {
        const metadata = JSON.parse(fs.readFileSync('scripts/player_metadata.json', 'utf8'));
        
        for (const meta of metadata) {
            const { error } = await supabase
                .from('players')
                .update({ gender: meta.gender })
                .eq('name', meta.name);
            
            if (error) {
                console.error(`❌ Error updating ${meta.name}:`, error.message);
            } else {
                process.stdout.write('.');
            }
        }
        console.log('\n✅ Gender sync for players table completed.');
    } catch (e) {
        console.error('💥 Error:', e.message);
    }
}

syncPlayerGender();
