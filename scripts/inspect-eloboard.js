const axios = require('axios');
const cheerio = require('cheerio');

async function inspect() {
    console.log('Fetching all_bj_list...');
    const { data: html } = await axios.get('https://eloboard.com/univ/bbs/board.php?bo_table=all_bj_list&page=1', {
        headers: { 'User-Agent': 'Mozilla/5.0' }
    });
    const $ = cheerio.load(html);
    
    $('div.table-responsive table tbody tr').slice(0, 5).each((i, row) => {
        console.log(`\n=== ROW ${i+1} ===`);
        $(row).find('td').each((j, td) => {
            console.log(`Cell ${j}:`, $(td).text().trim(), ' | HTML:', $(td).html());
        });
    });
}

inspect();
