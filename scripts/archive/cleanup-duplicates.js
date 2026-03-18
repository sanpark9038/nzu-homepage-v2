const { createClient } = require('@supabase/supabase-js');
require('dotenv').config({ path: '.env.local' });

const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY);

async function cleanupDuplicates() {
    console.log('🧹 Cleaning up duplicate players...');
    
    // Get all players
    const { data: players, error } = await supabase.from('players').select('id, name, created_at');
    if (error) {
        console.error('Error fetching players:', error);
        return;
    }

    const nameGroups = {};
    players.forEach(p => {
        if (!nameGroups[p.name]) nameGroups[p.name] = [];
        nameGroups[p.name].push(p);
    });

    for (const name in nameGroups) {
        const group = nameGroups[name];
        if (group.length > 1) {
            console.log(`- Found ${group.length} entries for [${name}]. Keeping the newest one.`);
            // Sort by created_at descending
            group.sort((a, b) => new Date(b.created_at) - new Date(a.created_at));
            
            const [toKeep, ...toDelete] = group;
            const idsToDelete = toDelete.map(p => p.id);
            
            console.log(`  Deleting IDs: ${idsToDelete.join(', ')}`);
            const { error: delError } = await supabase.from('players').delete().in('id', idsToDelete);
            if (delError) console.error(`  ❌ Error deleting duplicates for ${name}:`, delError.message);
            else console.log(`  ✅ Cleaned up ${name}.`);
        }
    }
    
    console.log('✨ Cleanup finished.');
}

cleanupDuplicates();
