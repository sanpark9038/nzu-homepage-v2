const axios = require('axios');
const cheerio = require('cheerio');
const qs = require('querystring');

const HEADERS = {
    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
    'X-Requested-With': 'XMLHttpRequest',
    'Content-Type': 'application/x-www-form-urlencoded; charset=UTF-8'
};

async function inspectNaeriMatches() {
    const name = '나예리';
    try {
        const { data: html } = await axios.post(`https://eloboard.com/women/bbs/view_list.php`, qs.stringify({
            p_name: name,
            last_id: 0,
            b_id: 'eloboard'
        }), { headers: HEADERS });
        
        const $ = cheerio.load(html);
        
        console.log(`--- [${name}] Matches Inspection ---`);
        
        const matches = [];
        $('tr').each((i, el) => {
            if (i === 0) return;
            const cells = $(el).find('td');
            if (cells.length >= 6) {
                const date = $(cells[0]).text().trim();
                const opp = $(cells[1]).text().trim();
                const resultText = $(cells[3]).text().trim();
                const note = $(cells[5]).text().trim();
                
                // Get color for win/loss
                const style = $(cells[0]).attr('style') || '';
                const styleClean = style.replace(/\s/g, '').toLowerCase();
                let result = '?';
                if (styleClean.includes('background:#0cf') || styleClean.includes('background:#00ccff')) result = '승';
                else if (styleClean.includes('background:#434348')) result = '패';

                matches.push({ date, opp, result, note });
            }
        });

        console.table(matches.slice(0, 20));

    } catch (e) {
        console.error(e);
    }
}

inspectNaeriMatches();
