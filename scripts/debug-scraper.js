
const axios = require('axios');
const iconv = require('iconv-lite');
const cheerio = require('cheerio');

async function debugScraper() {
  const url = 'https://eloboard.com/univ/bbs/board.php?bo_table=input_team&page=1';
  console.log('Fetching board page 1...');
  
  const res = await axios.get(url, { responseType: 'arraybuffer' });
  const html = iconv.decode(res.data, 'cp949');
  const $ = cheerio.load(html);
  
  const posts = [];
  $('a').each((i, el) => {
    const text = $(el).text().trim();
    const href = $(el).attr('href') || '';
    if (href.includes('wr_id=') && text.length > 5) {
      posts.push({ text, href });
    }
  });

  console.log(`Found ${posts.length} posts.`);
  
  // Find a post that might contain the Sla vs Kyiring match
  // 3/4 정선숲퍼컵
  for (const post of posts) {
    if (post.text.includes('정선') || post.text.includes('03.04')) {
      console.log(`\nAnalyzing post: ${post.text}`);
      const pRes = await axios.get(post.href, { responseType: 'arraybuffer' });
      const pHtml = iconv.decode(pRes.data, 'cp949');
      const $p = cheerio.load(pHtml);
      
      $p('tr').each((j, tr) => {
        const trText = $(tr).text().trim().replace(/\s+/g, ' ');
        if (trText.includes('vs')) {
          console.log(`Found vs line: ${trText}`);
        }
      });
    }
  }
}

debugScraper();
