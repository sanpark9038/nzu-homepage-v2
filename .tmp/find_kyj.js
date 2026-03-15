const axios = require('axios');
const cheerio = require('cheerio');

async function findKimYoungJin() {
  const univ = encodeURIComponent('뉴캣슬');
  const url = `https://eloboard.com/univ/bbs/board.php?bo_table=all_bj_list&univ_name=${univ}`;
  try {
    const { data: html } = await axios.get(url, { headers: { 'User-Agent': 'Mozilla/5.0' } });
    const $ = cheerio.load(html);
    $('a.p_name').each((i, el) => {
      const text = $(el).text();
      if (text.includes('김영진')) {
        console.log(`Matched: ${text} | Href: ${$(el).attr('href')}`);
      }
    });
  } catch (e) {
    console.error(e.message);
  }
}
findKimYoungJin();
