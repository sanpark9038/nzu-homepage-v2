const axios = require('axios');
const cheerio = require('cheerio');

async function testFetch() {
  const url = 'https://eloboard.com/univ/bbs/board.php?bo_table=all_bj_list&univ_name=%EB%8A%AA%EC%A7%80%EB%8C%80';
  console.log('Fetching:', url);
  try {
    const { data } = await axios.get(url, {
      timeout: 15000,
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
      }
    });
    
    const $ = cheerio.load(data);
    const rows = $('table tbody tr');
    console.log(`Found ${rows.length} rows`);
    
    rows.each((i, el) => {
      const texts = $(el).find('td').map((_, td) => $(td).text().trim().replace(/\s+/g, ' ')).get();
      console.log(`Row ${i}:`, texts.join(' | '));
    });
  } catch (error) {
    console.error('Error fetching:', error.message);
  }
}

testFetch();
