const axios = require('axios');
const cheerio = require('cheerio');

async function check() {
  const menUrl = 'https://eloboard.com/men/bbs/month_list.php';
  try {
    const { data: htmlFragment } = await axios.post(menUrl, 'sear_=s9&b_id=eloboard', {
        headers: { 
          'User-Agent': 'Mozilla/5.0',
          'Content-Type': 'application/x-www-form-urlencoded'
        }
    });
    const $ = cheerio.load(`<table><tbody>${htmlFragment}</tbody></table>`);
    $('a.p_name').each((i, el) => {
      const name = $(el).text().trim();
      const href = $(el).attr('href');
      const wrIdMatch = href.match(/wr_id=(\d+)/);
      const wrId = wrIdMatch ? wrIdMatch[1] : 'N/A';
      console.log(`[Men Ranking] ${name} (${wrId})`);
    });
  } catch (e) {
    console.error(e.message);
  }
}
check();
