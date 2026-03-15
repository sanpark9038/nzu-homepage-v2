const axios = require('axios');
const cheerio = require('cheerio');

async function getPlayerDetails(name, wrId) {
    console.log(`\n🔍 Fetching details for [${name}] (ID: ${wrId})...`);
    const url = `https://eloboard.com/women/bbs/board.php?bo_table=bj_list&wr_id=${wrId}`;
    
    try {
        const { data } = await axios.get(url, { headers: { 'User-Agent': 'Mozilla/5.0' } });
        const $ = cheerio.load(data);
        
        const details = {};
        $('th').each((i, el) => {
            const key = $(el).text().trim();
            const value = $(el).next('td').text().trim();
            if (key) details[key] = value;
        });
        
        console.log('--- Profile Data ---');
        console.log(JSON.stringify(details, null, 2));

        // Let's also find the race and tier specifically
        const title = $('title').text().trim();
        console.log('Title:', title);
        
        return details;
    } catch (e) {
        console.error(`Error: ${e.message}`);
    }
}

async function start() {
    await getPlayerDetails('애공', '223');
    await getPlayerDetails('란란', '350');
    await getPlayerDetails('키링', '827');
}

start();
