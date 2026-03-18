
const axios = require('axios');
const iconv = require('iconv-lite');
const cheerio = require('cheerio');

async function inspectPost() {
  const url = 'https://eloboard.com/univ/bbs/board.php?bo_table=input_team&wr_id=1614';
  const res = await axios.get(url, { responseType: 'arraybuffer' });
  const html = iconv.decode(res.data, 'cp949');
  const $ = cheerio.load(html);
  
  console.log('Post Content (first 1000 chars):');
  console.log($('#bo_v_atc').text().trim().slice(0, 1000));
  
  console.log('\nChecking for tables:');
  $('table').each((i, el) => {
    console.log(`Table ${i} text sample:`, $(el).text().trim().slice(0, 100));
  });

  console.log('\nChecking for match lines:');
  $('tr, div, p').each((i, el) => {
    const text = $(el).text().trim().replace(/\s+/g, ' ');
    if (text.includes('vs') && (text.includes('win') || text.includes('lose'))) {
      console.log(`Match line found in ${el.name}: ${text}`);
    }
  });
}

inspectPost();
