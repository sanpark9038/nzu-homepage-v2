const axios = require('axios');
const cheerio = require('cheerio');

async function check() {
    const { data: html } = await axios.get('https://eloboard.com/univ/bbs/board.php?bo_table=all_bj_list&page=1', {
        headers: { 'User-Agent': 'Mozilla/5.0' }
    });
    const $ = cheerio.load(html);
    
    $('div.table-responsive table tbody tr').slice(0, 10).each((i, row) => {
        const name = $(row).find('a.p_name').text().trim();
        let univ = 'N/A';
        $(row).find('td').each((j, td) => {
            const link = $(td).find('a');
            link.each((k, a) => {
                const href = $(a).attr('href') || '';
                if (href.includes('bo_table=univ_list')) {
                    univ = $(a).text().trim();
                }
            });
        });
        console.log(`Player: ${name} | University: ${univ}`);
    });
}

check();
