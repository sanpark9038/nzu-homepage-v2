const { createClient } = require('@supabase/supabase-js');
const fs = require('fs');
const path = require('path');
require('dotenv').config({ path: '.env.local' });

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
);

async function exportToCsv() {
    console.log('🚀 Exporting DB to Excel-friendly CSV files...');

    try {
        // 1. Export Players
        console.log('- Fetching players...');
        const { data: players } = await supabase.from('players').select('name, eloboard_id, gender, university, race, last_synced_at');
        
        if (players && players.length > 0) {
            const playerHeaders = ['이름', '엘로보드ID', '성별', '대학교', '종족', '마지막동기화'];
            const playerRows = players.map(p => [
                p.name, 
                p.eloboard_id || '', 
                p.gender || '', 
                p.university || '', 
                p.race || '', 
                p.last_synced_at || ''
            ].map(val => `"${val}"`).join(','));
            
            const playerCsv = [playerHeaders.join(','), ...playerRows].join('\n');
            fs.writeFileSync(path.join(process.cwd(), 'players_export.csv'), '\ufeff' + playerCsv); // Adding BOM for Excel Korean support
            console.log('✅ players_export.csv created!');
        }

        // 2. Export Recent Matches (Last 5000)
        console.log('- Fetching recent 5,000 matches (total 88k is too big for a single preview)');
        const { data: matches } = await supabase
            .from('eloboard_matches')
            .select('player_name, opponent_name, opponent_race, map, result_text, match_date, note')
            .order('match_date', { ascending: false })
            .limit(5000);
        
        if (matches && matches.length > 0) {
            const matchHeaders = ['선수명', '상대명', '상대종족', '맵', '결과', '경기일자', '비고'];
            const matchRows = matches.map(m => [
                m.player_name,
                m.opponent_name,
                m.opponent_race,
                m.map,
                m.result_text,
                m.match_date,
                m.note.replace(/"/g, '""')
            ].map(val => `"${val}"`).join(','));

            const matchCsv = [matchHeaders.join(','), ...matchRows].join('\n');
            fs.writeFileSync(path.join(process.cwd(), 'recent_matches_export.csv'), '\ufeff' + matchCsv);
            console.log('✅ recent_matches_export.csv created!');
        }

        console.log('\n✨ Export finished! You can now open these files directly in Excel.');
    } catch (e) {
        console.error('Export failed:', e.message);
    }
}

exportToCsv();
