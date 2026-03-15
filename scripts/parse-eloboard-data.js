const fs = require('fs');
const cheerio = require('cheerio');

// Analyze view_list.php response - this is the match history
const html1 = fs.readFileSync('.tmp/eloboard_test_view_list.php', 'utf8');
const $ = cheerio.load(html1);

console.log('=== view_list.php (Match History) ===');
console.log('Size:', html1.length, 'bytes');

// Find tables
const tables = $('table');
console.log('Tables found:', tables.length);

// Look at the first few rows
const rows = $('tr');
console.log('Total rows:', rows.length);

// Print first 10 rows
let count = 0;
$('tr').each((i, el) => {
    if (count >= 15) return false;
    const cells = $(el).find('td');
    if (cells.length > 0) {
        const cellTexts = [];
        cells.each((j, cell) => {
            cellTexts.push($(cell).text().trim().substring(0, 40));
        });
        if (cellTexts.some(t => t.length > 0)) {
            console.log(`Row ${i}: [${cellTexts.join(' | ')}]`);
            count++;
        }
    }
});

// Also check view_list2
const html2 = fs.readFileSync('.tmp/eloboard_test_view_list2.php', 'utf8');
const $2 = cheerio.load(html2);
console.log('\n=== view_list2.php (Opponent Stats?) ===');
console.log('Size:', html2.length, 'bytes');
const rows2 = $2('tr').length;
console.log('Total rows:', rows2);

let count2 = 0;
$2('tr').each((i, el) => {
    if (count2 >= 15) return false;
    const cells = $2(el).find('td');
    if (cells.length > 0) {
        const cellTexts = [];
        cells.each((j, cell) => {
            cellTexts.push($2(cell).text().trim().substring(0, 40));
        });
        if (cellTexts.some(t => t.length > 0)) {
            console.log(`Row ${i}: [${cellTexts.join(' | ')}]`);
            count2++;
        }
    }
});
