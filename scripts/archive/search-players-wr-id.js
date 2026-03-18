const axios = require('axios');
const cheerio = require('cheerio');

async function searchPlayer(name) {
  const url = `https://eloboard.com/women/bbs/board.php?bo_table=bj_list&stx=${encodeURIComponent(name)}`;
  console.log(`Searching for ${name} at: ${url}`);
  
  try {
    const { data } = await axios.get(url, { headers: { 'User-Agent': 'Mozilla/5.0' } });
    const $ = cheerio.load(data);
    
    // Look for links that point to bj_list with a wr_id
    const results = [];
    $('a').each((i, el) => {
        const href = $(el).attr('href') || '';
        const text = $(el).text().trim();
        if (href.includes('bo_table=bj_list') && href.includes('wr_id=') && text.includes(name)) {
            const wrIdMatch = href.match(/wr_id=(\d+)/);
            if (wrIdMatch) {
                results.push({ name: text, wrId: wrIdMatch[1], link: href });
            }
        }
    });
    
    return results;
  } catch (err) {
    console.error(`Error searching ${name}:`, err.message);
    return [];
  }
}

async function start() {
    const players = ['애공', '키링', '란란', '기뉴다'];
    for (const name of players) {
        const res = await searchPlayer(name);
        console.log(`Results for ${name}:`, JSON.stringify(res, null, 2));
    }
}

start();
