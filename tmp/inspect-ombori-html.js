const axios = require('axios');
const cheerio = require('cheerio');
const qs = require('querystring');

const HEADERS = {
    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
    'X-Requested-With': 'XMLHttpRequest',
    'Content-Type': 'application/x-www-form-urlencoded; charset=UTF-8'
};

async function inspectHtml() {
    const name = '엄보리';
    try {
        const { data: html } = await axios.post(`https://eloboard.com/women/bbs/view_list.php`, qs.stringify({
            p_name: name,
            last_id: 0,
            b_id: 'eloboard'
        }), { headers: HEADERS });
        
        const $ = cheerio.load(html);
        
        console.log(`--- [${name}] Raw HTML Data Inspection (2024-12-29 focus) ---`);
        
        $('tr').each((i, el) => {
            const rowText = $(el).text();
            if (rowText.includes('2024-12-29')) {
                console.log(`\nRow ${i}:`);
                console.log($.html(el));
            }
        });

    } catch (e) {
        console.error(e);
    }
}

inspectHtml();
