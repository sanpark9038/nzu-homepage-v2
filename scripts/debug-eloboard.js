const axios = require('axios');
const cheerio = require('cheerio');

async function debugBoard() {
  try {
    const url = 'https://eloboard.com/univ/bbs/board.php?bo_table=input_team';
    console.log(`Fetching ${url}...`);
    const { data } = await axios.get(url, {
      headers: { 'User-Agent': 'Mozilla/5.0' }
    });
    
    // Save first 2000 chars to see headers if needed
    // console.log(data.slice(0, 2000));

    const $ = cheerio.load(data);
    console.log('--- Post Titles and Links ---');
    $('.td_subject a').each((i, el) => {
      const text = $(el).text().trim();
      const href = $(el).attr('href');
      if (text) {
        console.log(`${i + 1}: [${text}] -> ${href}`);
      }
    });

    if ($('.td_subject a').length === 0) {
      console.log('No posts found with .td_subject a. Trying common fallback selectors...');
      $('a').each((i, el) => {
        const h = $(el).attr('href') || '';
        if (h.includes('wr_id=')) {
           console.log(`Found candidate: [${$(el).text().trim()}] -> ${h}`);
        }
      });
    }
  } catch (e) {
    console.error(e.message);
  }
}

debugBoard();
