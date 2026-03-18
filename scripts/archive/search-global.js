const axios = require('axios');
const cheerio = require('cheerio');

async function searchGlobal() {
  const names = ['기뉴다', '박학수'];
  const sites = [
      'https://eloboard.com/bbs/board.php?bo_table=bj_list&stx=',
      'https://eloboard.com/univ/bbs/board.php?bo_table=all_bj_list&stx=',
      'https://eloboard.com/men/bbs/board.php?bo_table=bj_list&stx='
  ];
  
  for (const name of names) {
    console.log(`\n--- Global Search for [${name}] ---`);
    for (const site of sites) {
        const url = site + encodeURIComponent(name);
        try {
            const { data } = await axios.get(url, { headers: { 'User-Agent': 'Mozilla/5.0' } });
            const $ = cheerio.load(data);
            
            $('a').each((i, el) => {
                const href = $(el).attr('href') || '';
                const text = $(el).text().trim();
                if (href.includes('wr_id=') && text.includes(name)) {
                    const wrIdMatch = href.match(/wr_id=(\d+)/);
                    if (wrIdMatch) {
                        console.log(`URL: ${url} -> Found ${text}: ID=${wrIdMatch[1]}`);
                    }
                }
            });
        } catch (e) {
            console.log(`Error searching ${name} at ${url}: ${e.message}`);
        }
    }
  }
}

searchGlobal();
