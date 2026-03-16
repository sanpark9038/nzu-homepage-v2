
const axios = require('axios');
const cheerio = require('cheerio');
const iconv = require('iconv-lite');
const { createClient } = require('@supabase/supabase-js');
require('dotenv').config({ path: '.env.local' });

const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY);

async function fetchHtml(url) {
  try {
    const res = await axios.get(url, { responseType: 'arraybuffer', timeout: 10000 });
    return res.data.toString('utf8'); // Assuming utf8 as current site standard
  } catch (e) {
    return null;
  }
}

async function searchPlayer(name) {
  const boards = [
    { gender: 'women', url: 'https://eloboard.com/women/bbs/board.php?bo_table=bj_list' },
    { gender: 'male', url: 'https://eloboard.com/men/bbs/board.php?bo_table=bj_list' }
  ];

  for (const board of boards) {
    const searchUrl = `${board.url}&stx=${encodeURIComponent(name)}`;
    const html = await fetchHtml(searchUrl);
    if (!html) continue;

    const $ = cheerio.load(html);
    let foundId = null;

    // Look for link that contains obj_list and wr_id
    $('a').each((i, el) => {
      const href = $(el).attr('href') || '';
      const text = $(el).text().trim();
      
      // Look for exact name match in text or nearby
      if (href.includes('wr_id=') && (text === name || text.includes(name))) {
        const match = href.match(/wr_id=(\d+)/);
        if (match) {
          foundId = match[1];
          return false; // found
        }
      }
    });

    if (foundId) {
      return { id: foundId, gender: board.gender };
    }
  }
  return null;
}

async function runMapping() {
  const { data: missing, error } = await supabase
    .from('players')
    .select('name')
    .is('eloboard_id', null);

  if (error) {
    console.error(error);
    return;
  }

  console.log(`Starting automated mapping for ${missing.length} players...`);
  let successCount = 0;

  for (const player of missing) {
    console.log(`Searching for [${player.name}]...`);
    const result = await searchPlayer(player.name);
    
    if (result) {
      console.log(`  ✅ Found: ${player.name} -> ID: ${result.id} (${result.gender})`);
      const { error: updateError } = await supabase
        .from('players')
        .update({ eloboard_id: result.id, gender: result.gender })
        .eq('name', player.name);
      
      if (!updateError) successCount++;
      else console.error(`  ❌ Update Error: ${updateError.message}`);
    } else {
      console.log(`  ❓ Not found: ${player.name}`);
    }
    // Polite delay
    await new Promise(r => setTimeout(r, 500));
  }

  console.log(`\nMapping Cycle Complete. Successfully mapped ${successCount} players.`);
}

runMapping();
