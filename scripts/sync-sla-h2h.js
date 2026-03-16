
const axios = require('axios');
const cheerio = require('cheerio');
const iconv = require('iconv-lite');
const { createClient } = require('@supabase/supabase-js');
require('dotenv').config({ path: '.env.local' });

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
);

async function syncProfileMatches(url, playerName, gender) {
  console.log(`Fetching profile for ${playerName} at ${url}...`);
  const res = await axios.get(url, { responseType: 'arraybuffer' });
  const html = res.data.toString('utf8');
  const $ = cheerio.load(html);
  
  const rawMatches = [];
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
        opponent_raw = col1;
        map = $(cells[2]).text().trim();
        result_text = col3;
        is_win = result_text.includes('+') || result_text.includes('승');
    } else {
        result_text = col1;
        is_win = result_text.includes('+') || result_text.includes('승');
        map = $(cells[2]).text().trim();
        opponent_raw = col3;
    }

    turn = $(cells[4]).text().trim();
    memo = cells.length > 5 ? $(cells[5]).text().trim() : '';

    const opponent_name = opponent_raw.replace(/\(.*?\)/, '').trim();
    const raceMatch = opponent_raw.match(/\(([PTZR])\)/i);
    const opponent_race = raceMatch ? raceMatch[1].toUpperCase() : 'U';

    if (opponent_name.includes('키링')) {
      const note = `[${turn}] ${memo}`.trim();
      console.log(`Found Match: ${playerName} vs ${opponent_name} on ${match_date} [${note}]`);
      
      rawMatches.push({
        player_name: playerName,
        opponent_name: opponent_name,
        opponent_race: opponent_race,
        map: map,
        is_win: is_win,
        result_text: result_text,
        match_date: match_date,
        note: note,
        gender: gender
      });

      // Reverse perspective
      rawMatches.push({
        player_name: opponent_name,
        opponent_name: playerName,
        opponent_race: 'Z', // Sla is Z
        map: map,
        is_win: !is_win,
        result_text: is_win ? '-99' : '+99', // Placeholder ELO for reverse
        match_date: match_date,
        note: note,
        gender: gender // Kyiring is also women's board
      });
    }
  });

  if (rawMatches.length > 0) {
    console.log(`Upserting ${rawMatches.length} match perspective entries...`);
    const { error } = await supabase.from('eloboard_matches').upsert(rawMatches, {
      onConflict: 'player_name, opponent_name, match_date, map, result_text, note'
    });
    if (error) console.error('Upsert Error:', error.message);
    else console.log('Successfully synced Sla vs Kyiring matches!');
  }
}

const slaUrl = 'https://eloboard.com/women/bbs/board.php?bo_table=bj_list&wr_id=57';
syncProfileMatches(slaUrl, '슬아', 'women');
