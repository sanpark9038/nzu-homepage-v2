const axios = require('axios');
const cheerio = require('cheerio');

async function checkMonthly(maxPages) {
    const names = [];
    for (let p = 1; p <= maxPages; p++) {
        const res = await axios.post('https://eloboard.com/univ/bbs/p_month_list.php', `sear_=s9&b_id=eloboard&page=${p}`, {
            headers: { 'User-Agent': 'Mozilla/5.0', 'Content-Type': 'application/x-www-form-urlencoded' }
        });
        const $ = cheerio.load(`<table><tbody>${res.data}</tbody></table>`);
        const rows = $('tr');
        if (rows.length === 0) break;
        rows.each((i, row) => {
            const name = $(row).find('td.list-subject a').text().trim();
            if (name) names.push(name);
        });
    }
    console.log(`Total active in ranking: ${names.length}`);
    console.log('Sample names:', names.slice(0, 10));
    console.log('Includes 김성민:', names.some(n => n.includes('김성민')));
}

checkMonthly(30);
