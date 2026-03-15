const fs = require('fs');
const cheerio = require('cheerio');

const html = fs.readFileSync('c:/Users/NZU/Desktop/nzu-homepage/.tmp/eloboard_h2h_correct.html', 'utf8');
const $ = cheerio.load(html);

console.log('--- Matches Found ---');
$('tr').each((i, row) => {
    const text = $(row).text();
    if (text.includes('애공') && text.includes('키링')) {
        const cells = $(row).find('td').map((j, cell) => $(cell).text().trim()).get();
        if (cells.length > 5) {
            console.log(cells.join(' | '));
        }
    }
});

// Also look for stats summary
const summary = $('.list-total').text() || $('.total-score').text();
if (summary) console.log('\nSummary:', summary.trim());
