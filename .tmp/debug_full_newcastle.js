const axios = require('axios');
const cheerio = require('cheerio');

async function debugFullStructure() {
  const univ = encodeURIComponent('뉴캣슬');
  const url = `https://eloboard.com/univ/bbs/board.php?bo_table=all_bj_list&univ_name=${univ}`;
  try {
    const { data: html } = await axios.get(url, { headers: { 'User-Agent': 'Mozilla/5.0' } });
    const $ = cheerio.load(html);
    
    console.log('--- Printing all rows in the first .table-responsive ---');
    $('div.table-responsive table tbody tr').each((i, row) => {
      const name = $(row).find('a.p_name').text().trim();
      const href = $(row).find('a.p_name').attr('href');
      console.log(`${i}: ${name} [${href}]`);
    });

  } catch (e) {
    console.error(e.message);
  }
}
debugFullStructure();
