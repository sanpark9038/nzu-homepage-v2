const axios = require('axios');
const cheerio = require('cheerio');

async function debug() {
    const { data: html } = await axios.get('https://eloboard.com/univ/bbs/board.php?bo_table=all_bj_list&page=1', {
        headers: { 'User-Agent': 'Mozilla/5.0' }
    });
    const $ = cheerio.load(html);
    const row = $('div.table-responsive table tbody tr').eq(10);
    console.log('--- ROW 10 HTML ---');
    console.log(row.html());
}

debug();
