const axios = require('axios');
const cheerio = require('cheerio');

async function analyzeSsustar() {
  const url = 'https://ssustar.iwinv.net/university_battle';
  console.log(`Analyzing Ssustar: ${url}`);
  try {
    const { data } = await axios.get(url, { headers: { 'User-Agent': 'Mozilla/5.0' } });
    const $ = cheerio.load(data);
    
    console.log("Looking for external data sources or API calls in scripts...");
    $('script').each((i, el) => {
      const src = $(el).attr('src');
      if (src) console.log(`Script src: ${src}`);
      const text = $(el).html();
      if (text && (text.includes('ajax') || text.includes('fetch') || text.includes('eloboard'))) {
        // console.log(`Inline script contains potential data fetch logic:\n`, text.substring(0, 200));
      }
    });

    console.log("Network calls/API endpoints referenced:");
    const bodyText = $('body').html();
    const urls = [...bodyText.matchAll(/https?:\/\/[^\s"',]+|^\/[^\s"',]+/g)].map(m => m[0]);
    const uniqueUrls = [...new Set(urls)].filter(u => u.includes('ajax') || u.includes('api') || u.includes('.php'));
    console.log(uniqueUrls);

  } catch (err) {
    console.error(err.message);
  }
}

analyzeSsustar();
