const axios = require('axios');
const cheerio = require('cheerio');

async function searchGinyuda() {
  const url = 'https://eloboard.com/univ/bbs/board.php?bo_table=all_bj_list&stx=%EA%B8%B0%EB%89%B4%EB%8B%A4';
  try {
    const { data } = await axios.get(url, { headers: { 'User-Agent': 'Mozilla/5.0' } });
    const $ = cheerio.load(data);
    
    $('a').each((i, el) => {
        const href = $(el).attr('href') || '';
        const text = $(el).text().trim();
        if (href.includes('wr_id=') && text.includes('기뉴다')) {
            console.log(`Found: [${text}] -> ${href}`);
        }
    });
  } catch (e) {
    console.log(`Error: ${e.message}`);
  }
}

searchGinyuda();
