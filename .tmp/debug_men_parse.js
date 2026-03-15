const axios = require('axios');
const cheerio = require('cheerio');

async function check() {
  const menUrl = 'https://eloboard.com/men/bbs/board.php?bo_table=month_list';
  try {
    const { data: menHtml } = await axios.get(menUrl, { headers: { 'User-Agent': 'Mozilla/5.0' } });
    const $ = cheerio.load(menHtml);
    console.log('Got HTML, parsing...');
    const links = $('a.p_name');
    console.log(`Found ${links.length} links`);
    links.slice(0, 50).each((i, el) => {
      const name = $(el).text().trim();
      const href = $(el).attr('href');
      const wrIdMatch = href.match(/wr_id=(\d+)/);
      const wrId = wrIdMatch ? wrIdMatch[1] : 'N/A';
      console.log(`[Men] ${name} (${wrId})`);
    });
  } catch (e) {
    console.error(e.message);
  }
}
check();
