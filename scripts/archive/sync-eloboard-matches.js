const axios = require('axios');
const cheerio = require('cheerio');
const iconv = require('iconv-lite');
const { createClient } = require('@supabase/supabase-js');
require('dotenv').config({ path: '.env.local' });

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
);

// --- CONFIGURATION ---
const BASE_URL = 'https://eloboard.com/univ/bbs/board.php?bo_table=input_team';
const DISCORD_WEBHOOK_URL = process.env.DISCORD_WEBHOOK_URL || null;
const DELAY_MS = 1000;
const MAX_PAGES = 15;

// Keywords to INCLUDE (Official)
const INCLUDE_KEYWORDS = ['리그', '컵', '대회', '스타대전', '8강', '4강', '준결승', '결승', 'B조', 'A조', '드래프트', '프리시즌', '대학전', '정선숲퍼컵'];
// Keywords to EXCLUDE (Casual/Mini)
const EXCLUDE_KEYWORDS = ['미니대전', '교수대전', '교류전', '유스', '아카데미', '친선'];

async function sendDiscordLog(message) {
  if (!DISCORD_WEBHOOK_URL) return;
  try {
    await axios.post(DISCORD_WEBHOOK_URL, { content: `📡 **NZU Sync Report**: ${message}` });
  } catch (e) {
    console.warn('Discord Webhook failed');
  }
}

async function fetchHtml(url) {
    const response = await axios.get(url, {
        responseType: 'arraybuffer',
        headers: { 'User-Agent': 'Mozilla/5.0' }
    });
    // Eloboard has mostly moved to utf8, but some legacy parts might be CP949.
    // Based on recent debugging, utf8 is now the standard for input_team board.
    return response.data.toString('utf8');
}

async function scrapeMatches() {
  const startTime = Date.now();
  const currentYear = new Date().getFullYear();
  const currentMonth = new Date().getMonth() + 1;

  console.log(`🚀 NZU Strategic Match Scraper V9 (Year Detection & Deep Sync) Starting...`);
  let totalNewMatches = 0;
  let skippedPosts = 0;

  try {
    for (let page = 1; page <= MAX_PAGES; page++) {
      console.log(`\n📄 Scanning Board Page ${page}...`);
      const listHtml = await fetchHtml(`${BASE_URL}&page=${page}`);
      const $list = cheerio.load(listHtml);
      const posts = [];

      $list('a').each((_, el) => {
        const href = $list(el).attr('href') || '';
        const title = $list(el).text().trim();
        if (href.includes('bo_table=input_team') && href.includes('wr_id=') && title.length > 5) {
            if (!posts.find(p => p.href === href)) {
                posts.push({ title, href });
            }
        }
      });

      console.log(`- Found ${posts.length} potential posts on page ${page}.`);

      for (const post of posts) {
        const isOfficial = INCLUDE_KEYWORDS.some(k => post.title.includes(k));
        const isExcluded = EXCLUDE_KEYWORDS.some(k => post.title.includes(k));

        if (!isOfficial && isExcluded) {
          console.log(`- Skipping Excluded Post: [${post.title}]`);
          skippedPosts++;
          continue;
        }

        console.log(`🔍 Processing: [${post.title}]`);
        await new Promise(r => setTimeout(r, DELAY_MS)); // Polite delay

        try {
          const postHtml = await fetchHtml(post.href);
          const $post = cheerio.load(postHtml);
          const rawMatches = [];

          const dateMatch = post.title.match(/(\d{1,2})\.(\d{1,2})/);
          let matchDate = '';
          if (dateMatch) {
            const mMonth = parseInt(dateMatch[1]);
            let year = currentYear;
            if (mMonth > currentMonth + 2 && currentYear > 2025) year = currentYear - 1;
            matchDate = `${year}-${dateMatch[1].padStart(2, '0')}-${dateMatch[2].padStart(2, '0')}`;
          } else {
            matchDate = new Date().toISOString().split('T')[0];
          }

          $post('table').each((_, table) => {
            const trs = $post(table).find('tr');
            trs.each((__, tr) => {
                const text = $post(tr).text().trim().replace(/\s+/g, ' ');
                if (text.includes('vs') && (text.includes('win') || text.includes('lose'))) {
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

                    // Perspective 1
                    rawMatches.push({
                        player_name: p1Name,
                        opponent_name: p2Name,
                        opponent_race: ['P','T','Z'].includes(p2Race) ? p2Race : 'U',
                        map: gameMap,
                        is_win: isWin,
                        result_text: isWin ? 'win' : 'lose',
                        match_date: matchDate,
                        note: `${post.title.slice(0, 50)} (${matchTurn})`
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
                        note: `${post.title.slice(0, 50)} (${matchTurn})`
                    });
                }
            });
          });

          if (rawMatches.length > 0) {
            const uniqueMatches = [];
            const seen = new Set();
            rawMatches.forEach(m => {
                const key = `${m.player_name}|${m.opponent_name}|${m.match_date}|${m.map}|${m.result_text}`;
                if (!seen.has(key)) {
                    seen.add(key);
                    uniqueMatches.push(m);
                }
            });

            console.log(`  ➕ Found ${uniqueMatches.length / 2} unique matches. Upserting...`);
            const { error: upsertError } = await supabase.from('eloboard_matches').upsert(uniqueMatches, {
              onConflict: 'player_name, opponent_name, match_date, map, result_text, note'
            });
            if (upsertError) console.error(`  ❌ Error: ${upsertError.message}`);
            else totalNewMatches += uniqueMatches.length / 2;
          }

        } catch (e) {
          console.error(`  ❌ Failed to crawl post: ${post.title}`, e.message);
        }
      }
    }

    const duration = (Date.now() - startTime) / 1000;
    const report = `Sync V9 Success! Processed ${totalNewMatches} official matches. Skipped ${skippedPosts} posts. Duration: ${duration}s.`;
    console.log(`\n✨ ${report}`);
    
    await supabase.from('sync_logs').insert({
      type: 'matches_board_v9',
      status: 'success',
      processed_count: totalNewMatches,
      duration_ms: Date.now() - startTime
    });

    await sendDiscordLog(report);

  } catch (err) {
    console.error('💥 Critical Error:', err.message);
  }
}

scrapeMatches();
