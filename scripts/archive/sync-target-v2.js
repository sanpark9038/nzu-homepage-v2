
const axios = require('axios');
const cheerio = require('cheerio');
const iconv = require('iconv-lite');
const { createClient } = require('@supabase/supabase-js');
require('dotenv').config({ path: '.env.local' });

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
);

async function syncTarget() {
  const url = 'https://eloboard.com/univ/bbs/board.php?bo_table=input_team&wr_id=1614';
  console.log(`Fetching ${url}...`);
  const res = await axios.get(url, { responseType: 'arraybuffer' });
  const html = iconv.decode(res.data, 'cp949');
  const $ = cheerio.load(html);
  
  const title = $('.bo_v_tit').text().trim() || '정선숲퍼컵 B조 4경기';
  console.log('Post Title:', title);

  const rawMatches = [];
  $('tr').each((i, tr) => {
    const text = $(tr).text().trim().replace(/\s+/g, ' ');
    if (text.includes('vs') && (text.includes('win') || text.includes('lose'))) {
      const parts = text.split(' ').filter(p => p.length > 0);
      const winIndex = parts.indexOf('win') !== -1 ? parts.indexOf('win') : parts.indexOf('lose');
      const vsIndex = parts.indexOf('vs');
      if (winIndex === -1 || vsIndex === -1) return;

      const p1Name = parts[winIndex + 1];
      const p1Race = (parts[winIndex + 2] || 'U').charAt(0).toUpperCase();
      const p2Name = parts[vsIndex + 1];
      const p2Race = (parts[vsIndex + 2] || 'U').charAt(0).toUpperCase();
      const gameMap = parts[parts.length - 1];

      rawMatches.push({
        player_name: p1Name,
        opponent_name: p2Name,
        opponent_race: p2Race,
        map: gameMap,
        is_win: parts[winIndex] === 'win',
        result_text: parts[winIndex],
        match_date: '2026-03-04',
        note: title
      });
      
      // Reverse
      rawMatches.push({
        player_name: p2Name,
        opponent_name: p1Name,
        opponent_race: p1Race,
        map: gameMap,
        is_win: parts[winIndex] !== 'win',
        result_text: parts[winIndex] === 'win' ? 'lose' : 'win',
        match_date: '2026-03-04',
        note: title
      });
      
      console.log(`Matched: ${p1Name} vs ${p2Name}`);
    }
  });

  if (rawMatches.length > 0) {
    const { error } = await supabase.from('eloboard_matches').upsert(rawMatches, {
      onConflict: 'player_name, opponent_name, match_date, map, result_text'
    });
    if (error) console.error('Error:', error.message);
    else console.log('Sync complete!');
  }
}

syncTarget();
