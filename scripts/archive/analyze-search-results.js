const fs = require('fs');
const cheerio = require('cheerio');

const html = fs.readFileSync('.tmp/search_aegong.html', 'utf8');
const $ = cheerio.load(html);

console.log('Searching for links with wr_id...');
$('a').each((i, el) => {
    const href = $(el).attr('href') || '';
    const text = $(el).text().trim();
    if (href.includes('wr_id=')) {
        console.log(`${i}: [${text}] -> ${href}`);
    }
});

console.log('\nSearching for table rows in the list...');
$('tr').each((i, el) => {
    const cells = $(el).find('td');
    if (cells.length > 0) {
        console.log(`Row ${i}: ${$(el).text().trim().replace(/\s+/g, ' ').substring(0, 100)}`);
    }
});
