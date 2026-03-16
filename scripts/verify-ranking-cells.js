const axios = require('axios');
const cheerio = require('cheerio');

async function verify() {
    const res = await axios.post('https://eloboard.com/univ/bbs/p_month_list.php', 'sear_=s9&b_id=eloboard&page=1', {
        headers: { 'User-Agent': 'Mozilla/5.0' }
    });
    const $ = cheerio.load(`<table><tbody>${res.data}</tbody></table>`);
    const row = $('tr').first();
    row.find('td').each((i, el) => {
        console.log(`Cell ${i} HTML:`, $(el).html());
    });
}
verify();
