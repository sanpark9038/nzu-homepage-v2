const axios = require('axios');
const cheerio = require('cheerio');

async function searchParkHakSu() {
  const url = 'https://eloboard.com/univ/bbs/board.php?bo_table=all_bj_list&stx=%EB%B0%95%ED%95%99%EC%88%98';
  try {
    const { data } = await axios.get(url, { headers: { 'User-Agent': 'Mozilla/5.0' } });
    const $ = cheerio.load(data);
    
    $('a').each((i, el) => {
        const href = $(el).attr('href') || '';
        const text = $(el).text().trim();
        if (href.includes('wr_id=')) {
            console.log(`Found: [${text}] -> ${href}`);
        }
    });
  } catch (e) {
    console.log(`Error: ${e.message}`);
  }
}

searchParkHakSu();
