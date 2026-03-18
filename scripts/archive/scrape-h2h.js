const axios = require('axios');
const fs = require('fs');

async function scrapeH2HData() {
    try {
        const url = 'https://ssustar.iwinv.net/university_battle.php';
        const res = await axios.get(url);
        
        // Extract playerH2H object
        const h2hMatch = res.data.match(/const playerH2H = (\{.*?\});/s);
        if (h2hMatch) {
            fs.writeFileSync('ssustar_h2h.json', h2hMatch[1]);
            console.log('Successfully saved H2H data to ssustar_h2h.json');
        } else {
            console.error('Could not find playerH2H data');
        }
    } catch (e) {
        console.error('Scrape error:', e.message);
    }
}

scrapeH2HData();
