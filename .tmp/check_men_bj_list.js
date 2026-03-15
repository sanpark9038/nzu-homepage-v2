const axios = require('axios');
const cheerio = require('cheerio');

async function check() {
  const menUrl = 'https://eloboard.com/men/bbs/board.php?bo_table=bj_list';
  try {
    const { data: html } = await axios.get(menUrl, { headers: { 'User-Agent': 'Mozilla/5.0' } });
    const $ = cheerio.load(html);
    $('a.p_name').each((i, el) => {
      const name = $(el).text().trim();
      const href = $(el).attr('href');
      const wrIdMatch = href.match(/wr_id=(\d+)/);
      const wrId = wrIdMatch ? wrIdMatch[1] : 'N/A';
      console.log(`[Men List] ${name} (${wrId})`);
    });
  } catch (e) {
    console.error(e.message);
  }
}
check();
