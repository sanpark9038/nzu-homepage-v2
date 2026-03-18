const axios = require('axios');
const cheerio = require('cheerio');
const qs = require('querystring');

const HEADERS = {
    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
    'X-Requested-With': 'XMLHttpRequest',
    'Content-Type': 'application/x-www-form-urlencoded; charset=UTF-8'
};

async function testHistory(name) {
    console.log(`Testing history for ${name}...`);
    try {
        const { data: html } = await axios.post('https://eloboard.com/men/bbs/view_list.php', qs.stringify({
            p_name: name,
            last_id: 0,
            b_id: 'eloboard'
        }), { headers: HEADERS });
        
        // Log the first bit of the HTML to see what's actually coming back
        console.log('HTML Length:', html.length);
        console.log('HTML Sample:', html.slice(0, 500));
        
        const $ = cheerio.load(html);
        const rows = [];
        $('tr').each((i, el) => {
            const cells = $(el).find('td');
            if (cells.length >= 4) {
                rows.push({
                    date: $(cells[0]).text().trim(),
                    opponent: $(cells[1]).text().trim(),
                    map: $(cells[2]).text().trim(),
                    result: $(cells[3]).text().trim(),
                    note: $(cells[5]) ? $(cells[5]).text().trim() : ''
                });
            }
        });
        
        console.log(`Found ${rows.length} matches.`);
        console.log('Sample rows:', rows.slice(0, 5));
        
        // Check for "24h" filtering possibility
        const now = new Date();
        const yesterday = new Date(now.getTime() - (24 * 60 * 60 * 1000));
        const yesterdayStr = yesterday.toISOString().split('T')[0];
        const todayStr = now.toISOString().split('T')[0];
        
        console.log(`Target Dates: ${yesterdayStr} ~ ${todayStr}`);
        
        const recent = rows.filter(r => r.date.includes(todayStr) || r.date.includes(yesterdayStr));
        console.log(`Recent matches (last ~24-48h): ${recent.length}`);
        recent.forEach(r => console.log(`- ${r.date} | ${r.opponent} | ${r.result} | ${r.note}`));
        
    } catch (e) {
        console.error('Error:', e.message);
    }
}

testHistory('조일장');
