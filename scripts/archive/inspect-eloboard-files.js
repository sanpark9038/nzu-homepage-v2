const fs = require('fs');
const cheerio = require('cheerio');

function inspect(filename) {
    console.log(`\n=== Inspecting ${filename} ===`);
    if (!fs.existsSync(filename)) {
        console.log('File does not exist');
        return;
    }
    const html = fs.readFileSync(filename, 'utf8');
    const $ = cheerio.load(html);
    
    $('tr').slice(0, 20).each((i, el) => {
        const cells = $(el).find('td, th');
        const txt = [];
        cells.each((j, c) => txt.push($(c).text().trim().replace(/\s+/g, ' ')));
        if (txt.length > 0) console.log(`Row ${i}: [${txt.join(' | ')}]`);
    });
}

inspect('.tmp/eloboard_test_view_list2.php');
inspect('.tmp/eloboard_test_view_list3.php');
inspect('.tmp/eloboard_test_view_mix_list.php');
