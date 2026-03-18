const axios = require('axios');
const cheerio = require('cheerio');

async function fetchLineup(univId) {
    const url = `https://eloboard.com/univ/bbs/board.php?bo_table=univ_list&wr_id=${univId}`;
    console.log(`Fetching lineup for University ${univId}...`);
    const { data: html } = await axios.get(url, { headers: { 'User-Agent': 'Mozilla/5.0' } });
    const $ = cheerio.load(html);
    const players = [];
    $('div.table-responsive table tbody tr').each((i, row) => {
        const nameAnchor = $(row).find('a.p_name');
        const name = nameAnchor.text().trim();
        const href = nameAnchor.attr('href') || '';
        const wrIdMatch = href.match(/wr_id=(\d+)/);
        if (name && wrIdMatch) {
            players.push({ name, wr_id: wrIdMatch[1] });
        }
    });
    return players;
}

async function run() {
    const newcastle = await fetchLineup(48);
    console.log('Newcastle Lineup:', newcastle);
}

run();
