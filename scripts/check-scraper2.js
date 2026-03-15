const cheerio = require('cheerio');
const fs = require('fs');

const data = fs.readFileSync('.tmp/test_https___eloboard_com_women_bbs_fight_list_php.html', 'utf8');
const $ = cheerio.load(data);

console.log('--- Fight List Parse ---');
console.log('Title:', $('title').text());

const rows = $('table tbody tr');
console.log('Rows found:', rows.length);
if (rows.length > 0) {
    for (let i=0; i<Math.min(5, rows.length); i++) {
        const texts = $(rows[i]).find('td').map((_, el) => $(el).text().trim()).get();
        console.log(`Row ${i}:`, texts.join(' | '));
    }
} else {
    console.log('No rows found. Showing raw text snippet:');
    console.log($('body').text().replace(/\s+/g, ' ').substring(0, 500));
}
