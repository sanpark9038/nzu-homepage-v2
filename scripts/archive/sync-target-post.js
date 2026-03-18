
const axios = require('axios');
const cheerio = require('cheerio');
const iconv = require('iconv-lite');
const { createClient } = require('@supabase/supabase-js');
require('dotenv').config({ path: '.env.local' });

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
);

async function fetchHtml(url) {
    const response = await axios.get(url, {
        responseType: 'arraybuffer',
        headers: { 'User-Agent': 'Mozilla/5.0' }
    });
    return iconv.decode(response.data, 'cp949');
}

async function syncSpecificPost(url, title) {
  console.log(`🔍 Processing specific post: [${title}]`);
  try {
    const postHtml = await fetchHtml(url);
    const $post = cheerio.load(postHtml);
    const rawMatches = [];

    // Use 2026 for now
    const dateMatch = title.match(/(\d{2}\.\d{2})/);
    const matchDate = dateMatch ? `2026-${dateMatch[1].replace('.', '-')}` : '2026-03-04';

    $post('table').each((_, table) => {
      const trs = $post(table).find('tr');
      trs.each((__, tr) => {
          const text = $post(tr).text().trim().replace(/\s+/g, ' ');
          if (text.includes('vs') && (text.includes('win') || text.includes('lose'))) {
              console.log(`Found line: ${text}`);
              const parts = text.split(' ').filter(p => p.length > 0);
              const winIndex = parts.indexOf('win') !== -1 ? parts.indexOf('win') : parts.indexOf('lose');
              const vsIndex = parts.indexOf('vs');
              if (winIndex === -1 || vsIndex === -1) return;

              const matchTurn = parts[0]; 
              const isWin = parts[winIndex] === 'win';
              const p1Name = parts[winIndex + 1];
              const p1Race = (parts[winIndex + 2] || 'U').charAt(0).toUpperCase();
              const p2Name = parts[vsIndex + 1];
              const p2Race = (parts[vsIndex + 2] || 'U').charAt(0).toUpperCase();
              const gameMap = parts[parts.length - 1];

              console.log(`Parsed: ${p1Name}(${p1Race}) ${isWin?'win':'lose'} vs ${p2Name}(${p2Race}) on ${gameMap}`);

              // Perspective 1
              rawMatches.push({
                  player_name: p1Name,
                  opponent_name: p2Name,
                  opponent_race: ['P','T','Z'].includes(p2Race) ? p2Race : 'U',
                  map: gameMap,
                  is_win: isWin,
                  result_text: isWin ? 'win' : 'lose',
                  match_date: matchDate,
                  note: `${title.slice(0, 50)} (${matchTurn})`
              });

              // Perspective 2
              rawMatches.push({
                  player_name: p2Name,
                  opponent_name: p1Name,
                  opponent_race: ['P','T','Z'].includes(p1Race) ? p1Race : 'U',
                  map: gameMap,
                  is_win: !isWin,
                  result_text: !isWin ? 'win' : 'lose',
                  match_date: matchDate,
                  note: `${title.slice(0, 50)} (${matchTurn})`
              });
          }
      });
    });

    if (rawMatches.length > 0) {
      console.log(`Upserting ${rawMatches.length / 2} matches...`);
      const { error } = await supabase.from('eloboard_matches').upsert(rawMatches, {
        onConflict: 'player_name, opponent_name, match_date, map, result_text'
      });
      if (error) console.error('Upsert error:', error.message);
      else console.log('Successfully synced!');
    } else {
      console.log('No matches found in this post.');
    }
  } catch (e) {
    console.error('Error:', e.message);
  }
}

const postUrl = 'https://eloboard.com/univ/bbs/board.php?bo_table=input_team&wr_id=1614';
const postTitle = '[정선숲퍼컵] B조 4경기 뉴캣슬 vs 늪지대';
syncSpecificPost(postUrl, postTitle);
