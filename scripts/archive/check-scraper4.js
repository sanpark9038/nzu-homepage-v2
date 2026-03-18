const cheerio = require('cheerio');
const fs = require('fs');

const data = fs.readFileSync('.tmp/test_https___eloboard_com_women_bbs_board_php_bo_table_search_list.html', 'utf8');
const $ = cheerio.load(data);

const uniqueLinks = new Set();
$('a').each((i, el) => {
    const href = $(el).attr('href');
    if (href && href.includes('bo_table=')) {
        uniqueLinks.add(href.match(/bo_table=([^&]+)/)[1]);
    }
});

console.log('Available bo_tables on eloboard menu:', Array.from(uniqueLinks).join(', '));
