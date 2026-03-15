const axios = require('axios');
const cheerio = require('cheerio');

async function getNewcastleMembers() {
  const univ = encodeURIComponent('뉴캣슬');
  const url = `https://eloboard.com/univ/bbs/board.php?bo_table=all_bj_list&univ_name=${univ}`;
  try {
    const { data: html } = await axios.get(url, { headers: { 'User-Agent': 'Mozilla/5.0' } });
    const $ = cheerio.load(html);
    const members = [];
    $('a.p_name').each((i, el) => {
      const text = $(el).text().trim();
      const href = $(el).attr('href');
      const wrIdMatch = href.match(/wr_id=(\d+)/);
      const wrId = wrIdMatch ? wrIdMatch[1] : null;
      members.push({ text, wrId });
    });
    console.log(JSON.stringify(members, null, 2));
  } catch (e) {
    console.error(e.message);
  }
}
getNewcastleMembers();
