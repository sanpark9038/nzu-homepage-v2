const cheerio = require('cheerio');
const fs = require('fs');

const data = fs.readFileSync('.tmp/test_https___eloboard_com_women_bbs_board_php_bo_table_search_list.html', 'utf8');
const $ = cheerio.load(data);

const rows = $('table tbody tr');
console.log('Search List Rows found:', rows.length);

rows.each((i, row) => {
    if (i > 10) return; // limit to first 10
    const tdTexts = $(row).find('td').map((_, el) => $(el).text().trim().replace(/\s+/g, ' ')).get();
    
    // Attempt to extract winner/loser and map if available
    const linkText = $(row).find('td.td_subject a').first().text().trim().replace(/\s+/g, ' ');
    console.log(`Row ${i}: [${tdTexts.join(' | ')}] -> Subject/Match: ${linkText}`);
});
