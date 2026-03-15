const axios = require('axios');
const cheerio = require('cheerio');

async function getDetailedNzuRoster() {
  const url = 'https://eloboard.com/univ/bbs/board.php?bo_table=all_bj_list&univ_name=%EB%8A%AA%EC%A7%80%EB%8C%80';
  console.log(`Fetching NZU roster from: ${url}`);
  
  try {
    const { data } = await axios.get(url, { headers: { 'User-Agent': 'Mozilla/5.0' } });
    const $ = cheerio.load(data);
    const players = [];

    $('table tbody tr').each((i, row) => {
      const nameCell = $(row).find('td').eq(0);
      const nameText = nameCell.text().trim(); // e.g. "애공(1)"
      const raceCell = $(row).find('td').eq(1);
      const raceText = raceCell.text().trim();
      
      // Look at all links in the row
      const links = [];
      $(row).find('a').each((j, link) => {
          links.push({
              text: $(link).text().trim(),
              href: $(link).attr('href')
          });
      });
      
      players.push({ nameText, raceText, links });
    });

    console.log(JSON.stringify(players, null, 2));
  } catch (err) {
    console.error('Error:', err.message);
  }
}

getDetailedNzuRoster();
