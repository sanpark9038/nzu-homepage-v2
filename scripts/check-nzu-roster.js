const axios = require('axios');
const cheerio = require('cheerio');

async function checkNzuRoster() {
  const url = 'https://eloboard.com/univ/bbs/board.php?bo_table=all_bj_list&univ_name=%EB%8A%AA%EC%A7%80%EB%8C%80';
  console.log(`Fetching NZU roster from: ${url}`);
  
  try {
    const { data } = await axios.get(url, { headers: { 'User-Agent': 'Mozilla/5.0' } });
    const $ = cheerio.load(data);
    const players = [];

    $('table tbody tr').each((i, row) => {
      const name = $(row).find('td').eq(0).text().trim();
      const race = $(row).find('td').eq(1).text().trim();
      const link = $(row).find('a').attr('href') || '';
      const wrIdMatch = link.match(/wr_id=(\d+)/);
      const wrId = wrIdMatch ? wrIdMatch[1] : 'N/A';
      
      players.push({ name, race, wrId, link });
    });

    console.log(JSON.stringify(players, null, 2));
  } catch (err) {
    console.error('Error:', err.message);
  }
}

checkNzuRoster();
