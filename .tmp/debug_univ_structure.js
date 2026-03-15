const axios = require('axios');
const cheerio = require('cheerio');

async function debugUnivStructure() {
  const univ = encodeURIComponent('뉴캣슬');
  const url = `https://eloboard.com/univ/bbs/board.php?bo_table=all_bj_list&univ_name=${univ}`;
  console.log(`Checking URL: ${url}`);
  try {
    const { data: html } = await axios.get(url, { headers: { 'User-Agent': 'Mozilla/5.0' } });
    const $ = cheerio.load(html);
    
    // Check for different tables or sections
    $('table').each((tableIdx, table) => {
      console.log(`\nTable #${tableIdx} found.`);
      const rows = $(table).find('tbody tr');
      console.log(`Number of rows: ${rows.length}`);
      
      // Let's see if there's a header before this table
      const headerText = $(table).prevAll('h2, h3, h4, b, strong, div.title, div.font-16').first().text().trim();
      console.log(`Probable Section Title: ${headerText}`);
      
      rows.slice(0, 5).each((rowIdx, row) => {
        const text = $(row).text().trim().replace(/\s+/g, ' ');
        console.log(`  Row ${rowIdx}: ${text}`);
      });
    });
  } catch (e) {
    console.error(e.message);
  }
}
debugUnivStructure();
