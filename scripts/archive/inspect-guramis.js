const axios = require('axios');
const cheerio = require('cheerio');

async function find() {
    const { data: html } = await axios.get('https://eloboard.com/univ/bbs/board.php?bo_table=all_bj_list&page=3', {
        headers: { 'User-Agent': 'Mozilla/5.0' }
    });
    const $ = cheerio.load(html);
    
    $('div.table-responsive table tbody tr').each((i, row) => {
        if ($(row).html().includes('149')) {
            console.log('--- FOUND ROW ---');
            $(row).find('td').each((j, td) => {
                console.log(`Cell ${j}:`, $(td).text().trim(), ' | HTML:', $(td).html());
            });
        }
    });
}

find();
