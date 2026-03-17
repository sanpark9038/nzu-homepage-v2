const axios = require('axios');
const cheerio = require('cheerio');
const qs = require('querystring');

const HEADERS = {
    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
    'X-Requested-With': 'XMLHttpRequest',
    'Content-Type': 'application/x-www-form-urlencoded; charset=UTF-8'
};

async function inspectTopRows() {
    const name = '엄보리';
    try {
        const { data: html } = await axios.post(`https://eloboard.com/women/bbs/view_list.php`, qs.stringify({
            p_name: name,
            last_id: 0,
            b_id: 'eloboard'
        }), { headers: HEADERS });
        
        const $ = cheerio.load(html);
        
        console.log(`--- [${name}] TOP Rows Inspection ---`);
        
        $('tr').each((i, el) => {
            if (i > 30) return; // Top 30 rows only
            const cells = $(el).find('td');
            if (cells.length >= 6) {
                const date = $(cells[0]).text().trim();
                const opp = $(cells[1]).text().trim();
                const note = $(cells[5]).text().trim();
                console.log(`[Row ${i}] Date: ${date}, Opp: ${opp}, Note: ${note}`);
            }
        });

    } catch (e) {
        console.error(e);
    }
}

inspectTopRows();
