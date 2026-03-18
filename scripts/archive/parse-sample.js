const fs = require('fs');
const cheerio = require('cheerio');
const iconv = require('iconv-lite');

// The previous attempt showed broken Korean characters, confirming CP949/EUC-KR.
// We read as buffer first.
const buffer = fs.readFileSync('C:\\Users\\NZU03\\Downloads\\nzu-homepage\\scripts\\eloboard_post_sample.html');

// Try decoding as CP949
let html = iconv.decode(buffer, 'cp949');

const $ = cheerio.load(html);

// Gnuboard usually uses #bo_v_atc or similar for post content
const content = $('#bo_v_atc');
console.log('--- Post Content Found? ', content.length > 0);
console.log('--- Post Title: ', $('title').text().trim());

if (content.length > 0) {
    console.log('--- Tables found: ', content.find('table').length);
    content.find('table').each((i, table) => {
        console.log(`\nTable ${i + 1}:`);
        $(table).find('tr').each((j, tr) => {
            const rowText = $(tr).text().trim().replace(/\s+/g, ' ');
            console.log(`  Row ${j + 1}: [${rowText}]`);
        });
    });
} else {
    // If #bo_v_atc is not found, let's explore the body for any table
    console.log('--- Searching for any table in body ---');
    $('table').each((i, table) => {
        if (i < 5) { // Only first 5 to avoid noise
            console.log(`\nGlobal Table ${i + 1}:`);
            $(table).find('tr').each((j, tr) => {
                const rowText = $(tr).text().trim().replace(/\s+/g, ' ');
                console.log(`    Row ${j + 1}: [${rowText.slice(0, 100)}]`);
            });
        }
    });
}
