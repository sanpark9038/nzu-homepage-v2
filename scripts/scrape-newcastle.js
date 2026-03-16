const axios = require('axios');
const cheerio = require('cheerio');
const fs = require('fs');

async function scrapeEloboard() {
  try {
    const url = 'https://eloboard.com/univ/bbs/board.php?bo_table=all_bj_list&univ_name=%EB%89%B4%EC%BA%A3%EC%8A%AC';
    console.log(`Fetching: ${url}`);
    const res = await axios.get(url, { headers: { 'User-Agent': 'Mozilla/5.0' } });
    const $ = cheerio.load(res.data);
    const players = [];
    
    // Selecting table rows. Inspecting the actual DOM structure of Eloboard via common patterns
    $('tr').each((i, row) => {
        const tds = $(row).find('td');
        if (tds.length >= 4) {
            const realName = tds.eq(1).text().trim();
            const bjName = tds.eq(2).text().trim();
            const race = tds.eq(3).text().trim();
            const tier = tds.eq(4).text().trim();
            
            if (realName && bjName && realName !== '이름') {
                players.push({ realName, bjName, race, tier });
            }
        }
    });
    
    fs.writeFileSync('newcastle_players.json', JSON.stringify(players, null, 2));
    console.log(`Successfully scraped ${players.length} players.`);
  } catch (e) {
    console.error('Scrape error:', e.message);
  }
}

scrapeEloboard();
