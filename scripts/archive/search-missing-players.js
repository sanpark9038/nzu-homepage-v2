const axios = require('axios');
const cheerio = require('cheerio');

async function searchSpecificPlayers() {
  const names = ['기뉴다', '박학수', '키링', '란란', '늪신'];
  // We'll search in both /univ/ and /women/ sections
  const sections = ['univ', 'women'];
  
  for (const name of names) {
    console.log(`\n--- Searching for [${name}] ---`);
    for (const section of sections) {
        const url = `https://eloboard.com/${section}/bbs/board.php?bo_table=bj_list&stx=${encodeURIComponent(name)}`;
        try {
            const { data } = await axios.get(url, { headers: { 'User-Agent': 'Mozilla/5.0' } });
            const $ = cheerio.load(data);
            
            $('a').each((i, el) => {
                const href = $(el).attr('href') || '';
                const text = $(el).text().trim();
                if (href.includes('wr_id=') && (text.includes(name) || href.includes(encodeURIComponent(name)))) {
                    const wrIdMatch = href.match(/wr_id=(\d+)/);
                    if (wrIdMatch) {
                        console.log(`[${section}] Found ${text}: ID=${wrIdMatch[1]} Link=${href}`);
                    }
                }
            });
        } catch (e) {
            console.log(`[${section}] Error searching ${name}: ${e.message}`);
        }
    }
  }
}

searchSpecificPlayers();
