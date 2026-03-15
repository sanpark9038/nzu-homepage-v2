const axios = require('axios');
const cheerio = require('cheerio');

async function check() {
  const menUrl = 'https://eloboard.com/men/bbs/p_month_list.php';
  try {
    const { data: htmlFragment } = await axios.post(menUrl, 'sear_=s9&b_id=eloboard', {
        headers: { 
          'User-Agent': 'Mozilla/5.0',
          'Content-Type': 'application/x-www-form-urlencoded'
        }
    });
    console.log('Got response content length:', htmlFragment.length);
    const $ = cheerio.load(`<table><tbody>${htmlFragment}</tbody></table>`);
    const links = $('a');
    console.log(`Found ${links.length} links`);
    links.each((i, el) => {
      const name = $(el).text().trim();
      const href = $(el).attr('href');
      if (href && href.includes('wr_id')) {
        const wrIdMatch = href.match(/wr_id=(\d+)/);
        const wrId = wrIdMatch ? wrIdMatch[1] : 'N/A';
        console.log(`[Player] ${name} (${wrId}) | Href: ${href}`);
      }
    });
  } catch (e) {
    console.error(e.message);
  }
}
check();
