const axios = require('axios');
const cheerio = require('cheerio');

async function searchNzuInWomen() {
  // Search for 늪지대 on eloboard women section
  const url = 'https://eloboard.com/women/bbs/board.php?bo_table=bj_list&sca=%EB%8A%AA%EC%A7%80%EB%8C%80';
  console.log(`Searching 늪지대 in women section: ${url}`);
  
  try {
    const { data } = await axios.get(url, { headers: { 'User-Agent': 'Mozilla/5.0' } });
    const $ = cheerio.load(data);
    const players = [];

    // The table structure might be different
    $('table tbody tr').each((i, row) => {
      const nameCell = $(row).find('td').eq(0);
      const name = nameCell.text().trim();
      const link = nameCell.find('a').attr('href') || '';
      const wrIdMatch = link.match(/wr_id=(\d+)/);
      const wrId = wrIdMatch ? wrIdMatch[1] : 'N/A';
      
      if (name) {
          players.push({ name, wrId, link });
      }
    });

    console.log(`Found ${players.length} players:`);
    console.log(JSON.stringify(players.slice(0, 10), null, 2));
  } catch (err) {
    console.error('Error:', err.message);
  }
}

searchNzuInWomen();
