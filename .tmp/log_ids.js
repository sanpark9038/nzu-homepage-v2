const axios = require('axios');
const cheerio = require('cheerio');

async function check() {
  const univ = encodeURIComponent('뉴캣슬');
  const url = `https://eloboard.com/univ/bbs/board.php?bo_table=all_bj_list&univ_name=${univ}`;
  try {
    const { data: html } = await axios.get(url, { headers: { 'User-Agent': 'Mozilla/5.0' } });
    const $ = cheerio.load(html);
    $('a.p_name').each((i, el) => {
      const name = $(el).text().trim();
      const href = $(el).attr('href');
      const wrIdMatch = href.match(/wr_id=(\d+)/);
      const wrId = wrIdMatch ? wrIdMatch[1] : 'N/A';
      console.log(`[Univ] ${name} (${wrId})`);
    });

    const menUrl = 'https://eloboard.com/men/bbs/board.php?bo_table=month_list';
    const { data: menHtml } = await axios.get(menUrl, { headers: { 'User-Agent': 'Mozilla/5.0' } });
    const $men = cheerio.load(menHtml);
    $men('a.p_name').slice(0, 30).each((i, el) => {
      const name = $men(el).text().trim();
      const href = $men(el).attr('href');
      const wrIdMatch = href.match(/wr_id=(\d+)/);
      const wrId = wrIdMatch ? wrIdMatch[1] : 'N/A';
      console.log(`[Men] ${name} (${wrId})`);
    });
  } catch (e) {
    console.error(e.message);
  }
}
check();
