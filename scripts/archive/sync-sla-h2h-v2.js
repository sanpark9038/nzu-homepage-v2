
const axios = require('axios');
const cheerio = require('cheerio');
const { createClient } = require('@supabase/supabase-js');
require('dotenv').config({ path: '.env.local' });

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
);

async function syncProfileMatches(playerName) {
  const url = `https://eloboard.com/women/bbs/board.php?bo_table=bj_list&wr_id=57`;
  const res = await axios.get(url);
  const $ = cheerio.load(res.data);
  
  const matches = [];
  $('table tr').each((i, row) => {
    const cells = $(row).find('td');
    if (cells.length < 5) return;
    const dateText = $(cells[0]).text().trim();
    if (!/^\d{2}-\d{2}-\d{2}$/.test(dateText) && !/^\d{4}-\d{2}-\d{2}$/.test(dateText)) return;
    const match_date = dateText.length === 8 ? `20${dateText}` : dateText;

    let result_text, is_win, map, opponent_raw, turn, memo;
    const col1 = $(cells[1]).text().trim();
    const col3 = $(cells[3]).text().trim();
    if (col1.includes('(')) {
        opponent_raw = col1; map = $(cells[2]).text().trim(); result_text = col3;
        is_win = result_text.includes('+') || result_text.includes('승');
    } else {
        result_text = col1; is_win = result_text.includes('+') || result_text.includes('승');
        map = $(cells[2]).text().trim(); opponent_raw = col3;
    }
    turn = $(cells[4]).text().trim(); memo = cells.length > 5 ? $(cells[5]).text().trim() : '';

    const opponent_name = opponent_raw.replace(/\(.*?\)/, '').trim();
    if (opponent_name.includes('키링')) {
      matches.push({
        player_name: playerName,
        opponent_name: opponent_name,
        opponent_race: opponent_raw.match(/\(([PTZR])\)/i)?.[1].toUpperCase() || 'U',
        map: map,
        is_win: is_win,
        result_text: result_text,
        match_date: match_date,
        note: `[${turn}] ${memo}`.trim(),
        gender: 'women'
      });
    }
  });

  console.log(`Found ${matches.length} matches against Kyiring on profile.`);

  for (const m of matches) {
    // Check if EXACT match (including note) already exists
    const { data: existing } = await supabase
      .from('eloboard_matches')
      .select('id')
      .match({
        player_name: m.player_name,
        opponent_name: m.opponent_name,
        match_date: m.match_date,
        map: m.map,
        result_text: m.result_text,
        note: m.note
      });

    if (!existing || existing.length === 0) {
      console.log(`  ➕ Inserting new match: ${m.match_date} [${m.note}]`);
      await supabase.from('eloboard_matches').insert(m);
      
      // Also insert reverse
      const reverse = {
        ...m,
        player_name: m.opponent_name,
        opponent_name: m.player_name,
        opponent_race: 'Z',
        is_win: !m.is_win,
        result_text: m.is_win ? '-99' : '+99'
      };
      await supabase.from('eloboard_matches').insert(reverse);
    } else {
      console.log(`  ✅ Match already exists: ${m.match_date} [${m.note}]`);
    }
  }
  console.log('Sync finished.');
}

syncProfileMatches('슬아');
