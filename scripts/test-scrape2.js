const axios = require('axios');
const cheerio = require('cheerio');

async function testFetch() {
  const url = 'https://eloboard.com/women/bbs/board.php?bo_table=rank_list'; // Women's ranking
  console.log('Fetching:', url);
  try {
    const { data } = await axios.get(url, {
      timeout: 15000,
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
      }
    });
    
    const $ = cheerio.load(data);
    const rows = $('table tbody tr');
    console.log(`Found ${rows.length} rows`);
    
    let nzuCount = 0;
    rows.each((i, el) => {
      // Typically rank_list has columns like: 순위 | 티어 | 종족 | 이름(소속) | ELO | 승패
      const $tds = $(el).find('td');
      if ($tds.length > 5) {
        const nameAndUniv = $tds.eq(3).text().trim();
        if (nameAndUniv.includes('늪지대') || nameAndUniv.includes('NZU')) {
          const rank = $tds.eq(0).text().trim();
          const tier = $tds.eq(1).text().trim();
          const race = $tds.eq(2).text().trim();
          const elo = $tds.eq(4).text().trim();
          const record = $tds.eq(5).text().trim(); // "100전 80승 20패"
          
          let href = $tds.eq(3).find('a').attr('href') || '';
          console.log(`Found: ${nameAndUniv} | Tier: ${tier} | Race: ${race} | ELO: ${elo} | Rec: ${record} | Link: ${href}`);
          nzuCount++;
        }
      }
    });
    console.log(`Total NZU found: ${nzuCount}`);
  } catch (error) {
    console.error('Error fetching:', error.message);
  }
}

testFetch();
