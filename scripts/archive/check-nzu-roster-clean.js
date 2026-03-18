const axios = require('axios');
const cheerio = require('cheerio');

async function getCleanNzuRoster() {
  const url = 'https://eloboard.com/univ/bbs/board.php?bo_table=all_bj_list&univ_name=%EB%8A%AA%EC%A7%80%EB%8C%80';
  
  try {
    const { data } = await axios.get(url, { headers: { 'User-Agent': 'Mozilla/5.0' } });
    const $ = cheerio.load(data);
    const players = [];

    $('table tbody tr').each((i, row) => {
      const nameText = $(row).find('td').eq(0).text().trim(); // e.g. "애공(1)"
      const raceText = $(row).find('td').eq(1).text().trim();
      
      const eloLink = $(row).find('a[href*="bo_table=bj_list"]').attr('href');
      let wrId = 'N/A';
      if (eloLink) {
          const match = eloLink.match(/wr_id=(\d+)/);
          if (match) wrId = match[1];
      }
      
      const nameMatch = nameText.match(/^(.*)\((.*)\)$/);
      const name = nameMatch ? nameMatch[1] : nameText;
      const tier = nameMatch ? nameMatch[2] : 'N/A';

      players.push({ name, tier, raceText, wrId });
    });

    console.log('NAME | TIER | RACE | WR_ID');
    console.log('---------------------------');
    players.forEach(p => {
        console.log(`${p.name} | ${p.tier} | ${p.raceText} | ${p.wrId}`);
    });
  } catch (err) {
    console.error('Error:', err.message);
  }
}

getCleanNzuRoster();
