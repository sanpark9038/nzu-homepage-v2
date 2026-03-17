const axios = require('axios');
const cheerio = require('cheerio');
const qs = require('querystring');

const HEADERS = {
    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
    'X-Requested-With': 'XMLHttpRequest',
    'Content-Type': 'application/x-www-form-urlencoded; charset=UTF-8'
};

async function inspectDevelopmentStructure() {
    const name = '으냉이'; // Using Eunaeng-i because the user specifically mentioned her and Image 1
    try {
        const { data: html } = await axios.post(`https://eloboard.com/women/bbs/view_list.php`, qs.stringify({
            p_name: name,
            last_id: 0,
            b_id: 'eloboard'
        }), { headers: HEADERS });
        
        const $ = cheerio.load(html);
        
        console.log(`--- [${name}] Developer Inspection ---`);
        
        $('tr').each((i, el) => {
            if (i === 0) return; // Skip header
            if (i > 5) return; // Just check a few rows

            const row = $(el);
            const cells = row.find('td');
            
            console.log(`\n[Row ${i}]`);
            console.log(`TR Style: ${row.attr('style') || 'none'}`);
            console.log(`TR Class: ${row.attr('class') || 'none'}`);
            
            cells.each((j, td) => {
                const cell = $(td);
                console.log(`  TD[${j}] Style: ${cell.attr('style') || 'none'}`);
                console.log(`  TD[${j}] Class: ${cell.attr('class') || 'none'}`);
                console.log(`  TD[${j}] Text: ${cell.text().trim()}`);
            });
        });

    } catch (e) {
        console.error(e);
    }
}

inspectDevelopmentStructure();
