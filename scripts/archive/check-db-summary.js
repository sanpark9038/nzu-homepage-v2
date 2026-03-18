const { createClient } = require('@supabase/supabase-js');
require('dotenv').config({ path: '.env.local' });

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
);

async function checkDatabaseStats() {
    console.log('--- 📊 NZU Database Master Report ---');
    
    // 1. Players Table Summary
    const { count: playerCount } = await supabase.from('players').select('*', { count: 'exact', head: true });
    const { count: mappedCount } = await supabase.from('players').select('*', { count: 'exact', head: true }).not('eloboard_id', 'is', null);
    
    console.log('\n[1] Players Status');
    console.log(`- Total Players: ${playerCount}`);
    console.log(`- Eloboard Mapped: ${mappedCount} (${((mappedCount/playerCount)*100).toFixed(1)}%)`);

    // 2. Matches Table Summary
    const { count: matchCount } = await supabase.from('eloboard_matches').select('*', { count: 'exact', head: true });
    const { data: recentMatches } = await supabase.from('eloboard_matches').select('*').order('created_at', { ascending: false }).limit(5);
    
    console.log('\n[2] Matches Status');
    console.log(`- Total Matches: ${matchCount.toLocaleString()}`);
    console.log('- Last 5 entries added (created_at):');
    recentMatches.forEach(m => console.log(`  └ [${m.match_date}] ${m.player_name} vs ${m.opponent_name} (${m.map})`));

    // 3. Top University Distribution (Example of data density)
    const { data: univData } = await supabase.from('players').select('university').not('university', 'is', null);
    const univStats = univData.reduce((acc, curr) => {
        acc[curr.university] = (acc[curr.university] || 0) + 1;
        return acc;
    }, {});
    
    console.log('\n[3] Top 5 Universities in DB');
    Object.entries(univStats)
        .sort((a,b) => b[1] - a[1])
        .slice(0, 5)
        .forEach(([univ, count]) => console.log(`  └ ${univ}: ${count} players`));

    // 4. Sync Logs
    const { data: logs } = await supabase.from('sync_logs').select('*').order('created_at', { ascending: false }).limit(3);
    console.log('\n[4] Recent Sync Activity');
    logs.forEach(l => console.log(`  └ ${l.created_at.split('T')[0]} | ${l.type} | Status: ${l.status} | Processed: ${l.processed_count}`));

    console.log('\n--- End of Report ---');
}

checkDatabaseStats();
